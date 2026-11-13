// Supabase reads/writes for /ops (contracts/api.md V2 ops 12, 14, 15, 17) plus the demo sample.
// Browser-side, anon key: RLS (sql/schema.sql, sql/v2.sql) decides what is allowed.
// Local stand-ins in P3's shapes: when lib/queries.ts ships ops 12-17, swap these imports.
import { supabase } from "@/lib/supabase";
import { getHoursDry, getStreets, type Street } from "@/lib/queries";
import { MOCK_HOURS_DRY, MOCK_STREETS } from "@/lib/mock";
import { priorityList, reservoirTier, streetStatuses, type Priority, type RecentReport, type Reservoir, type StreetStatus } from "@/components/ops/rules";

export type Category = "no_water" | "dirty_water" | "tanker_no_show" | "other";
export type Complaint = { id: number; street_id: number; category: Category; created_at: string; status: "open" | "resolved" };
export type OpsData = {
  streets: Street[];
  reservoir: Reservoir | null;
  hoursDry: Record<number, number | null>;
  priorities: Priority[];
  statuses: StreetStatus[];
  complaints: Complaint[]; // open only
  demo: boolean;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  no_water: "No water",
  dirty_water: "Dirty water",
  tanker_no_show: "Tanker did not come",
  other: "Other",
};

// Op 12: latest Mare aux Vacoas row. Null when the table is empty (P5's data/reservoir.csv not loaded yet).
export async function loadReservoir(): Promise<Reservoir | null> {
  const { data, error } = await supabase
    .from("reservoir_levels")
    .select("reservoir,day,level_pct,source_url")
    .ilike("reservoir", "%mare%vacoas%")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, tier: reservoirTier(data.level_pct) } : null;
}

// Op 14: open complaints, newest first; resolve one.
export async function loadOpenComplaints(): Promise<Complaint[]> {
  const { data, error } = await supabase
    .from("complaints")
    .select("id,street_id,category,created_at,status")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Complaint[];
}
export async function resolveComplaint(id: number): Promise<void> {
  const { error } = await supabase.from("complaints").update({ status: "resolved" }).eq("id", id);
  if (error) throw error;
}

// Op 15 input: reports of the last 3 h (all streets).
async function loadRecentReports(now = Date.now()): Promise<RecentReport[]> {
  const since = new Date(now - 3 * 3_600_000).toISOString();
  const { data, error } = await supabase.from("reports").select("street_id,type,created_at").gte("created_at", since);
  if (error) throw error;
  return (data ?? []) as RecentReport[];
}

// Op 17 input: waiting requests per street.
async function loadWaitingCounts(): Promise<Record<number, number>> {
  const { data, error } = await supabase.from("requests").select("street_id").eq("status", "waiting");
  if (error) throw error;
  const out: Record<number, number> = {};
  for (const r of data ?? []) out[r.street_id] = (out[r.street_id] ?? 0) + 1;
  return out;
}

/** Everything /ops shows. Throws when Supabase is unreachable or `streets` is empty: callers fall back to DEMO. */
export async function loadOps(): Promise<OpsData> {
  const streets = await getStreets();
  if (streets.length === 0) throw new Error("no streets loaded yet");
  const [reservoir, hoursDry, reports, waiting, complaints] = await Promise.all([
    loadReservoir(),
    getHoursDry(),
    loadRecentReports(),
    loadWaitingCounts(),
    loadOpenComplaints(),
  ]);
  return {
    streets,
    reservoir,
    hoursDry,
    priorities: priorityList(streets.map((s) => s.id), hoursDry, waiting),
    statuses: streetStatuses(streets, reports),
    complaints,
    demo: false,
  };
}

// ---------- demo sample (database empty or unreachable) ----------

// Real published figure (data/reservoir_levels.csv, 2026-10-08), shown as a sample until op 12 has rows.
export const SAMPLE_RESERVOIR: Reservoir = {
  reservoir: "Mare aux Vacoas",
  day: "2026-10-08",
  level_pct: 35.7,
  source_url: "https://www.riotimesonline.com/mauritius-boreholes-water-crisis-2026/",
  tier: reservoirTier(35.7),
};

export function demoOps(now = Date.now()): OpsData {
  const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  const streets = MOCK_STREETS;
  const waiting = { 2: 1, 4: 2 };
  // Street 3 says water is here while both neighbours say no water -> suspect.
  const reports: RecentReport[] = [
    { street_id: 1, type: "water_on", created_at: at(12) }, { street_id: 1, type: "water_on", created_at: at(25) },
    { street_id: 2, type: "water_off", created_at: at(6) }, { street_id: 2, type: "water_off", created_at: at(40) },
    { street_id: 3, type: "water_on", created_at: at(9) },
    { street_id: 4, type: "water_off", created_at: at(15) }, { street_id: 4, type: "water_off", created_at: at(70) },
    { street_id: 5, type: "water_off", created_at: at(33) },
  ];
  return {
    streets,
    reservoir: SAMPLE_RESERVOIR,
    hoursDry: MOCK_HOURS_DRY,
    priorities: priorityList(streets.map((s) => s.id), MOCK_HOURS_DRY, waiting),
    statuses: streetStatuses(streets, reports, now),
    complaints: [
      { id: -1, street_id: 4, category: "tanker_no_show", created_at: at(18), status: "open" },
      { id: -2, street_id: 5, category: "no_water", created_at: at(95), status: "open" },
      { id: -3, street_id: 2, category: "dirty_water", created_at: at(240), status: "open" },
    ],
    demo: true,
  };
}

// Supabase reads/writes for /ops (contracts/api.md V2 ops 11, 12, 14, 15, 17) plus the demo sample.
// Browser-side, anon key: RLS (sql/schema.sql, sql/v2.sql) decides what is allowed.
// Local stand-ins in P3's shapes: when lib/queries.ts ships the shared versions, swap these imports.
import { supabase } from "@/lib/supabase";
import { getHoursDry, getStreets, type Street } from "@/lib/queries";
import { MOCK_HOURS_DRY } from "@/lib/mock";
import { demandByStreet, loadActiveRounds, loadAreas, loadReports, loadWaitingRequests, type LiveRound, type WaitingRequest } from "@/components/map/data";
import { DEMO_AREA, DEMO_STREETS, demoRecentReports, demoRounds, demoWaiting, readDemoDispatch } from "@/components/map/demo";
import { priorityList, reservoirTier, streetStatuses, type Priority, type Reservoir, type StreetStatus } from "@/components/ops/rules";

export type Category = "no_water" | "dirty_water" | "tanker_no_show" | "other";
export type Complaint = { id: number; street_id: number; category: Category; created_at: string; status: "open" | "resolved" };
export type OpsData = {
  streets: Street[];
  areaNames: Record<number, string>;
  reservoir: Reservoir | null;
  hoursDry: Record<number, number | null>;
  priorities: Priority[];
  statuses: StreetStatus[];
  complaints: Complaint[]; // open, plus resolved of the last 14 days
  waiting: WaitingRequest[];
  rounds: LiveRound[]; // active rounds (one per tanker)
  demo: boolean;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  no_water: "No water",
  dirty_water: "Dirty water",
  tanker_no_show: "Tanker did not come",
  other: "Other",
};

// Op 12: latest Mare aux Vacoas row. Null when the table is empty (data/reservoir.csv not loaded yet).
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

// Op 14: open complaints plus the recently resolved ones (so the Resolved filter has something), newest first.
export async function loadComplaints(now = Date.now()): Promise<Complaint[]> {
  const since = new Date(now - 14 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("complaints")
    .select("id,street_id,category,created_at,status")
    .or(`status.eq.open,created_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Complaint[];
}
export async function setComplaintStatus(id: number, status: Complaint["status"]): Promise<void> {
  const { error } = await supabase.from("complaints").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Priority list with litres, from waiting requests (op 17 rule unchanged). */
export function prioritiesFor(streets: Street[], hoursDry: Record<number, number | null>, waiting: WaitingRequest[]): Priority[] {
  const d = demandByStreet(waiting);
  const count: Record<number, number> = {}, litres: Record<number, number> = {};
  for (const [id, v] of Object.entries(d)) { count[Number(id)] = v.requests; litres[Number(id)] = v.litres; }
  return priorityList(streets.map((s) => s.id), hoursDry, count, litres);
}

/** Everything /ops shows. Throws when Supabase is unreachable or `streets` is empty: callers fall back to DEMO. */
export async function loadOps(): Promise<OpsData> {
  const streets = await getStreets();
  if (streets.length === 0) throw new Error("no streets loaded yet");
  const [areas, reservoir, hoursDry, reports, waiting, complaints, rounds] = await Promise.all([
    loadAreas(),
    loadReservoir().catch(() => null), // table missing until sql/v2.sql runs: show the sample instead
    getHoursDry(),
    loadReports(3 / 24),
    loadWaitingRequests(),
    loadComplaints().catch(() => [] as Complaint[]),
    loadActiveRounds(),
  ]);
  return {
    streets,
    areaNames: Object.fromEntries(areas.map((a) => [a.id, a.name])),
    reservoir,
    hoursDry,
    priorities: prioritiesFor(streets, hoursDry, waiting),
    statuses: streetStatuses(streets, reports),
    complaints,
    waiting,
    rounds,
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
  const waiting = demoWaiting(now);
  return {
    streets: DEMO_STREETS,
    areaNames: { [DEMO_AREA.id]: DEMO_AREA.name },
    reservoir: SAMPLE_RESERVOIR,
    hoursDry: MOCK_HOURS_DRY,
    priorities: prioritiesFor(DEMO_STREETS, MOCK_HOURS_DRY, waiting),
    statuses: streetStatuses(DEMO_STREETS, demoRecentReports(now), now),
    complaints: [
      { id: -1, street_id: 4, category: "tanker_no_show", created_at: at(18), status: "open" },
      { id: -2, street_id: 5, category: "no_water", created_at: at(95), status: "open" },
      { id: -3, street_id: 2, category: "dirty_water", created_at: at(240), status: "open" },
      { id: -4, street_id: 4, category: "no_water", created_at: at(130), status: "open" },
      { id: -5, street_id: 4, category: "no_water", created_at: at(300), status: "open" },
      { id: -6, street_id: 1, category: "no_water", created_at: at(1500), status: "resolved" },
    ],
    waiting,
    rounds: readDemoDispatch() ? demoRounds() : [],
    demo: true,
  };
}

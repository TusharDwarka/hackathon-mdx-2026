// Shared Supabase reads/writes for /driver, /map and /ops (contracts/api.md ops 1, 4-9).
// Browser-side, anon key: RLS in sql/schema.sql decides what is allowed.
// Several rounds can be active at once (one per tanker): nothing here assumes a single global round.
import { supabase } from "@/lib/supabase";
import { ASSUMED_REQUEST_L } from "@/components/ops/dispatch";
import type { RecentReport } from "@/components/ops/rules";
import type { ScheduleRow } from "@/components/map/layers";

export type Street = { id: number; area_id: number; name: string; lat: number; lng: number; order_index: number };
export type Area = { id: number; name: string };
/** `planned` = CWA staff assigned it to a tanker, the driver has not tapped Start yet. */
export type Round = { id: number; status: "planned" | "active" | "done"; started_at: string };
export type Stop = { id: number; round_id: number; street_id: number; stop_order: number; served_at: string | null; street: Street; litres?: number; trip?: number };
export type Fix = { lat: number; lng: number; recorded_at: string };
/** One tanker with a round. `label` is the tanker's name, "Round 12" for a round without a tanker, "Tanker A" in demo. */
export type LiveRound = { round: Round; label: string; stops: Stop[]; tanker_id?: number | null };
/** litres: the request's own litres once P3 adds the column, else ASSUMED_REQUEST_L (`assumed` = true). */
export type WaitingRequest = { street_id: number; created_at: string; litres: number; assumed: boolean };

const STREET_COLS = "id,area_id,name,lat,lng,order_index";
const STOP_COLS = `id,round_id,street_id,stop_order,served_at, street:streets(${STREET_COLS})`;
export const roundLabel = (id: number) => `Round ${id}`;

export async function loadStreets(): Promise<Street[]> {
  const { data, error } = await supabase.from("streets").select(STREET_COLS).order("order_index");
  if (error) throw error;
  return (data ?? []) as Street[];
}

export async function loadAreas(): Promise<Area[]> {
  const { data, error } = await supabase.from("areas").select("id,name");
  if (error) throw error;
  return (data ?? []) as Area[];
}

/** Every open round (assigned by CWA staff or already on the road) with its stops, oldest first. */
export async function loadActiveRounds(): Promise<LiveRound[]> {
  const { data, error } = await supabase.from("rounds").select("id,status,started_at,tanker_id,tanker:tankers(name)").in("status", ["planned", "active"]).order("started_at");
  if (error) throw error;
  const rounds = (data ?? []) as unknown as (Round & { tanker_id: number | null; tanker: { name: string } | null })[];
  if (!rounds.length) return [];
  const { data: stops, error: e2 } = await supabase.from("round_stops").select(STOP_COLS).in("round_id", rounds.map((r) => r.id)).order("stop_order");
  if (e2) throw e2;
  const all = (stops ?? []) as unknown as Stop[];
  return rounds.map(({ tanker, tanker_id, ...round }) => ({ round, tanker_id, label: tanker?.name ?? roundLabel(round.id), stops: all.filter((s) => s.round_id === round.id) }));
}

/** Op 8: latest GPS fix per round. */
export async function loadLatestFixes(roundIds: number[]): Promise<Record<number, Fix>> {
  const out: Record<number, Fix> = {};
  await Promise.all(
    roundIds.map(async (id) => {
      const { data, error } = await supabase.from("truck_positions").select("lat,lng,recorded_at").eq("round_id", id).order("recorded_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (data) out[id] = data as Fix;
    })
  );
  return out;
}

/** Waiting requests. select("*") so the `litres` column is used as soon as P3 adds it, with no code change. */
export async function loadWaitingRequests(): Promise<WaitingRequest[]> {
  const { data, error } = await supabase.from("requests").select("*").eq("status", "waiting");
  if (error) throw error;
  return ((data ?? []) as { street_id: number; created_at: string; litres?: number | null }[]).map((r) => {
    const own = Number(r.litres);
    return { street_id: r.street_id, created_at: r.created_at, litres: own > 0 ? own : ASSUMED_REQUEST_L, assumed: !(own > 0) };
  });
}

/** Litres and request count per street. `before` keeps requests that arrived after a round started out of it. */
export function demandByStreet(reqs: WaitingRequest[], before?: string): Record<number, { requests: number; litres: number; assumed: boolean }> {
  const out: Record<number, { requests: number; litres: number; assumed: boolean }> = {};
  for (const r of reqs) {
    if (before && r.created_at > before) continue;
    const d = (out[r.street_id] ??= { requests: 0, litres: 0, assumed: false });
    d.requests++;
    d.litres += r.litres;
    d.assumed ||= r.assumed;
  }
  return out;
}

/** Op 4: one round (one tanker) with its stops in the given order. */
export async function createRound(streets: Street[]): Promise<LiveRound> {
  const { data: r, error } = await supabase.from("rounds").insert({}).select("id,status,started_at").single();
  if (error) throw error;
  const { data: rs, error: e2 } = await supabase
    .from("round_stops")
    .insert(streets.map((s, i) => ({ round_id: r.id, street_id: s.id, stop_order: i + 1 })))
    .select("id,round_id,street_id,stop_order,served_at");
  if (e2) throw e2;
  const byId = new Map(streets.map((s) => [s.id, s]));
  const stops = (rs ?? []).map((x) => ({ ...x, street: byId.get(x.street_id)! })).sort((a, b) => a.stop_order - b.stop_order);
  return { round: r as Round, label: roundLabel(r.id), stops };
}

/**
 * Op 6, safe for two drivers: only this stop (and only if not served yet), and only requests on that
 * street that were already waiting when this round started. Newer requests stay waiting for the next round.
 */
export async function serveStop(stop: Stop, round: Round, servedAt: string): Promise<void> {
  const { error } = await supabase.from("round_stops").update({ served_at: servedAt }).eq("id", stop.id).is("served_at", null);
  if (error) throw error;
  const { error: e2 } = await supabase.from("requests").update({ status: "served" }).eq("street_id", stop.street_id).eq("status", "waiting").lte("created_at", round.started_at);
  if (e2) throw e2;
}

/** Op 7. */
export async function finishRound(roundId: number): Promise<void> {
  const { error } = await supabase.from("rounds").update({ status: "done", ended_at: new Date().toISOString() }).eq("id", roundId).eq("status", "active");
  if (error) throw error;
}

/** Op 1 input for the notice layer: the whole published timetable. */
export async function loadSchedule(): Promise<ScheduleRow[]> {
  const { data, error } = await supabase.from("schedule").select("area_id,day,start_time,end_time,source_url,source_date");
  if (error) throw error;
  return (data ?? []) as ScheduleRow[];
}

/** Tanker stops / public water points (docs/WATER-DAY-SPLIT.md P4 item 4): P5's data/water_points.csv, loaded by P3. */
export type WaterPoint = { name: string; kind: string; lat: number; lng: number; source_url: string | null };
export async function loadWaterPoints(): Promise<WaterPoint[]> {
  const { data, error } = await supabase.from("water_points").select("name,kind,lat,lng,source_url");
  if (error) throw error;
  return (data ?? []) as WaterPoint[];
}

/** Reports of the last `days` days (reliability layer uses 14, the report layer the last 3 h of them). */
export async function loadReports(days: number, now = Date.now()): Promise<RecentReport[]> {
  const since = new Date(now - days * 86_400_000).toISOString();
  const { data, error } = await supabase.from("reports").select("street_id,type,created_at").gte("created_at", since);
  if (error) throw error;
  return (data ?? []) as RecentReport[];
}

/** Readable text for any error, including Supabase's plain-object errors. */
export const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

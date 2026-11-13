// Supabase queries for the demo path (contracts/api.md ops 1, 2, 3, 10, 11).
// Uses the anon client: RLS (sql/schema.sql) allows reading everything and inserting
// reports / requests. Everything is stored by street, never by house or person.
//
// Shapes match lib/mock.ts so Home can swap `MOCK_*` for these calls.
// Every function throws on a Supabase error: callers catch and fall back to mock data.
//
// Self-check of the pure date logic (no database needed): npx tsx lib/queries.ts

import { supabase } from "./supabase";

export type Area = { id: number; name: string };
export type Street = { id: number; area_id: number; name: string; lat: number; lng: number; order_index: number };
export type Window = { day: string; start_time: string; end_time: string; source_url: string | null; source_date: string | null };
export type ReportType = "water_on" | "water_off";
export type Reliability = { onTime: number; days: number; perDay: { date: string; onTime: boolean }[] };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------- reference data ----------

export async function getAreas(): Promise<Area[]> {
  const { data, error } = await supabase.from("areas").select("id,name").order("name");
  if (error) throw error;
  return data ?? [];
}

/** All streets (one area in the demo), in driving order. Home uses this for the picker. */
export async function getStreets(areaId?: number): Promise<Street[]> {
  let q = supabase.from("streets").select("id,area_id,name,lat,lng,order_index").order("order_index");
  if (areaId !== undefined) q = q.eq("area_id", areaId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ---------- op 1: today's official window ----------

/** Official CWA window for the street's area today, or null if the timetable has no window today. */
export async function getTodayWindow(streetId: number, now = new Date()): Promise<Window | null> {
  const { data: street, error: se } = await supabase.from("streets").select("area_id").eq("id", streetId).single();
  if (se) throw se;
  const { data, error } = await supabase
    .from("schedule")
    .select("day,start_time,end_time,source_url,source_date")
    .eq("area_id", street.area_id)
    .in("day", [DAY_NAMES[now.getDay()], isoDate(now)])
    .order("start_time")
    .limit(1);
  if (error) throw error;
  const w = data?.[0];
  return w ? { ...w, start_time: hhmm(w.start_time), end_time: hhmm(w.end_time) } : null;
}

// ---------- op 2 / op 3: one-tap report, "I need water" ----------

export async function postReport(streetId: number, type: ReportType): Promise<void> {
  const { error } = await supabase.from("reports").insert({ street_id: streetId, type });
  if (error) throw error;
}

/** Returns the new request id so Home can show its status (waiting / served). */
export async function postRequest(streetId: number): Promise<number> {
  const { data, error } = await supabase.from("requests").insert({ street_id: streetId, status: "waiting" }).select("id").single();
  if (error) throw error;
  return data.id;
}

// ---------- op 10: reliability ("on time 4 of 7 days") ----------

/** Over the last `days` days: days with an official window where a water_on report fell inside it. */
export async function getReliability(streetId: number, days = 7, now = new Date()): Promise<Reliability> {
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  const [{ data: street, error: se }, { data: reports, error: re }] = await Promise.all([
    supabase.from("streets").select("area_id").eq("id", streetId).single(),
    supabase.from("reports").select("created_at").eq("street_id", streetId).eq("type", "water_on").gte("created_at", since.toISOString()),
  ]);
  if (se) throw se;
  if (re) throw re;
  const { data: windows, error: we } = await supabase.from("schedule").select("day,start_time,end_time").eq("area_id", street.area_id);
  if (we) throw we;
  return computeReliability(
    (reports ?? []).map((r) => new Date(r.created_at)),
    windows ?? [],
    days,
    now
  );
}

/** Pure: one entry per past day (yesterday back to `days` ago) that has an official window. */
export function computeReliability(
  waterOn: Date[],
  windows: Pick<Window, "day" | "start_time" | "end_time">[],
  days = 7,
  now = new Date()
): Reliability {
  const perDay: Reliability["perDay"] = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const w = windows.find((x) => x.day === DAY_NAMES[d.getDay()] || x.day === isoDate(d));
    if (!w) continue;
    const start = atTime(d, w.start_time), end = atTime(d, w.end_time);
    perDay.push({ date: isoDate(d), onTime: waterOn.some((t) => t >= start && t <= end) });
  }
  return { onTime: perDay.filter((p) => p.onTime).length, days: perDay.length, perDay };
}

// ---------- op 11: heat map (hours since last water_on, per street) ----------

/** street_id -> hours since the last water_on report; null when the street never reported water. */
export async function getHoursDry(areaId?: number, now = new Date()): Promise<Record<number, number | null>> {
  const streets = await getStreets(areaId);
  const ids = streets.map((s) => s.id);
  const { data, error } = await supabase
    .from("reports")
    .select("street_id,created_at")
    .eq("type", "water_on")
    .in("street_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return computeHoursDry(ids, data ?? [], now);
}

/** Pure: `reports` may be in any order; the latest water_on per street wins. */
export function computeHoursDry(
  streetIds: number[],
  reports: { street_id: number; created_at: string }[],
  now = new Date()
): Record<number, number | null> {
  const out: Record<number, number | null> = Object.fromEntries(streetIds.map((id) => [id, null]));
  for (const r of reports) {
    const h = Math.max(0, (now.getTime() - new Date(r.created_at).getTime()) / 3_600_000);
    const cur = out[r.street_id];
    if (cur === null || cur === undefined || h < cur) out[r.street_id] = Math.round(h * 10) / 10;
  }
  return out;
}

// ---------- reports of today (Resident day track) ----------

export type TodayReport = { type: ReportType; created_at: string };

/** This street's reports since local midnight, oldest first. */
export async function getTodayReports(streetId: number, now = new Date()): Promise<TodayReport[]> {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("reports")
    .select("type,created_at")
    .eq("street_id", streetId)
    .gte("created_at", midnight.toISOString())
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as TodayReport[];
}

// ---------- op 12: reservoir status (DEMO thresholds, label them as such in the UI) ----------

export type ReservoirTier = "normal" | "watch" | "critical";
export type ReservoirStatus = { reservoir: string; level_pct: number; day: string; tier: ReservoirTier; source_url: string | null };

/** Pure: >= 60 normal, 30 to 60 watch, < 30 critical. */
export function reservoirTier(levelPct: number): ReservoirTier {
  return levelPct >= 60 ? "normal" : levelPct >= 30 ? "watch" : "critical";
}

/** Latest reservoir_levels row for the reservoir, or null when nothing is loaded yet. */
export async function getReservoirStatus(reservoir = "Mare aux Vacoas"): Promise<ReservoirStatus | null> {
  const { data, error } = await supabase
    .from("reservoir_levels")
    .select("reservoir,level_pct,day,source_url")
    .eq("reservoir", reservoir)
    .order("day", { ascending: false })
    .limit(1);
  if (error) throw error;
  const r = data?.[0];
  return r ? { ...r, tier: reservoirTier(r.level_pct) } : null;
}

// ---------- op 14: complaints (street + category only, no free text) ----------

export type ComplaintCategory = "no_water" | "dirty_water" | "tanker_no_show" | "other";
export type Complaint = { id: number; street_id: number; category: ComplaintCategory; created_at: string; status: "open" | "resolved" };

export async function postComplaint(streetId: number, category: ComplaintCategory): Promise<number> {
  const { data, error } = await supabase.from("complaints").insert({ street_id: streetId, category }).select("id").single();
  if (error) throw error;
  return data.id;
}

/** Open complaints, newest first (Ops). */
export async function getOpenComplaints(): Promise<Complaint[]> {
  const { data, error } = await supabase
    .from("complaints")
    .select("id,street_id,category,created_at,status")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Complaint[];
}

export async function resolveComplaint(complaintId: number): Promise<void> {
  const { error } = await supabase.from("complaints").update({ status: "resolved" }).eq("id", complaintId);
  if (error) throw error;
}

// ---------- op 15: street water status with trust ----------

export type StreetStatus = {
  street_id: number;
  status: ReportType | null; // majority of the last 3 h; null = no report
  trust: "confirmed" | "unconfirmed";
  suspect: boolean; // one lone report that contradicts both neighbouring streets
  reports: number;
};

const STATUS_WINDOW_H = 3;

/** Majority type of a list of report types (ties -> the most recent, which is last). */
function majority(types: ReportType[]): ReportType | null {
  if (!types.length) return null;
  const on = types.filter((t) => t === "water_on").length;
  const off = types.length - on;
  return on > off ? "water_on" : off > on ? "water_off" : types[types.length - 1];
}

/**
 * Pure. `mine`: this street's report types in the last 3 h, oldest first.
 * `prev` / `next`: the neighbouring streets' types (null when there is no such street).
 * confirmed = >= 2 reports and >= 2/3 agree. suspect = exactly 1 report and both neighbours
 * have a status that contradicts it.
 */
export function computeStreetStatus(
  streetId: number,
  mine: ReportType[],
  prev: ReportType[] | null,
  next: ReportType[] | null
): StreetStatus {
  const status = majority(mine);
  const agree = status ? mine.filter((t) => t === status).length : 0;
  const trust = mine.length >= 2 && agree / mine.length >= 2 / 3 ? "confirmed" : "unconfirmed";
  const p = prev ? majority(prev) : null;
  const n = next ? majority(next) : null;
  const suspect = mine.length === 1 && p !== null && n !== null && p !== status && n !== status;
  return { street_id: streetId, status, trust, suspect, reports: mine.length };
}

/** Status with trust for every street (one area in the demo). Ops uses this for "suspect reports". */
export async function getStreetStatuses(areaId?: number, now = new Date()): Promise<Record<number, StreetStatus>> {
  const streets = await getStreets(areaId);
  const since = new Date(now.getTime() - STATUS_WINDOW_H * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("reports")
    .select("street_id,type")
    .in("street_id", streets.map((s) => s.id))
    .gte("created_at", since)
    .order("created_at");
  if (error) throw error;
  const byStreet: Record<number, ReportType[]> = {};
  for (const r of data ?? []) (byStreet[r.street_id] ??= []).push(r.type as ReportType);
  const out: Record<number, StreetStatus> = {};
  streets.forEach((s, i) => {
    const prev = streets[i - 1], next = streets[i + 1];
    out[s.id] = computeStreetStatus(s.id, byStreet[s.id] ?? [], prev ? byStreet[prev.id] ?? [] : null, next ? byStreet[next.id] ?? [] : null);
  });
  return out;
}

export async function getStreetStatus(streetId: number, now = new Date()): Promise<StreetStatus> {
  const all = await getStreetStatuses(undefined, now);
  return all[streetId] ?? computeStreetStatus(streetId, [], null, null);
}

// ---------- op 16: likely water time ----------

export type LikelyWaterTime = { from: string; to: string; days_hit: number; days_total: number };

/**
 * Pure. From water_on reports: the fixed 2-hour slot (00-02, 02-04, ...) hit on the most days.
 * days_total = distinct days with a water_on report; null under 3 days of history.
 */
export function computeLikelyWaterTime(waterOn: Date[]): LikelyWaterTime | null {
  const daysPerSlot: Set<string>[] = Array.from({ length: 12 }, () => new Set());
  const allDays = new Set<string>();
  for (const t of waterOn) {
    const day = isoDate(t);
    allDays.add(day);
    daysPerSlot[Math.floor(t.getHours() / 2)].add(day);
  }
  if (allDays.size < 3) return null;
  let best = 0;
  daysPerSlot.forEach((s, i) => {
    if (s.size > daysPerSlot[best].size) best = i;
  });
  const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  return { from: hh(best * 2), to: hh(best * 2 + 2), days_hit: daysPerSlot[best].size, days_total: allDays.size };
}

export async function getLikelyWaterTime(streetId: number, now = new Date()): Promise<LikelyWaterTime | null> {
  const since = new Date(now);
  since.setDate(since.getDate() - 14);
  const { data, error } = await supabase
    .from("reports")
    .select("created_at")
    .eq("street_id", streetId)
    .eq("type", "water_on")
    .gte("created_at", since.toISOString());
  if (error) throw error;
  return computeLikelyWaterTime((data ?? []).map((r) => new Date(r.created_at)));
}

// ---------- op 17: priority list (Ops) ----------

export type PriorityAction = "send tanker" | "place a static tank" | "watch";
export type PriorityRow = { street_id: number; name: string; hours_dry: number | null; waiting: number; score: number; action: PriorityAction };

/** Pure: score = hours dry + 12 x waiting requests; a street that never reported water counts 0 h. */
export function computePriority(hoursDry: number | null, waiting: number): { score: number; action: PriorityAction } {
  const dry = hoursDry ?? 0;
  const score = Math.round(dry + 12 * waiting);
  const action: PriorityAction = waiting > 0 ? "send tanker" : dry > 48 ? "place a static tank" : "watch";
  return { score, action };
}

/** All streets sorted by score, highest first. */
export async function getPriorityList(areaId?: number, now = new Date()): Promise<PriorityRow[]> {
  const streets = await getStreets(areaId);
  const [hours, { data: waiting, error }] = await Promise.all([
    getHoursDry(areaId, now),
    supabase.from("requests").select("street_id").eq("status", "waiting").in("street_id", streets.map((s) => s.id)),
  ]);
  if (error) throw error;
  const waitingBy: Record<number, number> = {};
  for (const r of waiting ?? []) waitingBy[r.street_id] = (waitingBy[r.street_id] ?? 0) + 1;
  return streets
    .map((s) => {
      const w = waitingBy[s.id] ?? 0;
      return { street_id: s.id, name: s.name, hours_dry: hours[s.id] ?? null, waiting: w, ...computePriority(hours[s.id] ?? null, w) };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------- helpers ----------

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hhmm(t: string): string {
  return t.slice(0, 5); // Postgres time comes back as "05:00:00"
}
function atTime(day: Date, t: string): Date {
  const [h, m] = t.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

// Self-check: npx tsx lib/queries.ts
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("queries.ts")) {
  const now = new Date(2026, 10, 13, 12, 0); // Fri 13 Nov 2026 12:00 local
  const win = [{ day: "Mon", start_time: "05:00:00", end_time: "09:00:00" }, { day: "Thu", start_time: "05:00:00", end_time: "09:00:00" }];
  const r = computeReliability(
    [new Date(2026, 10, 12, 6, 30), new Date(2026, 10, 9, 11, 0)], // Thu on time, Mon late
    win, 7, now
  );
  console.assert(r.days === 2, "two days with a window in the last 7");
  console.assert(r.onTime === 1 && r.perDay[1].onTime && !r.perDay[0].onTime, "Thu on time, Mon late");
  const daily = computeReliability([new Date(2026, 10, 12, 6, 30)], [{ day: "2026-11-12", start_time: "05:00", end_time: "09:00" }], 7, now);
  console.assert(daily.days === 1 && daily.onTime === 1, "per-date timetable");

  const h = computeHoursDry([1, 2, 3], [
    { street_id: 1, created_at: new Date(2026, 10, 13, 10, 0).toISOString() },
    { street_id: 1, created_at: new Date(2026, 10, 12, 10, 0).toISOString() },
    { street_id: 2, created_at: new Date(2026, 10, 11, 12, 0).toISOString() },
  ], now);
  console.assert(h[1] === 2 && h[2] === 48 && h[3] === null, "hours dry");

  // op 12: tier thresholds (demo)
  console.assert(reservoirTier(60) === "normal" && reservoirTier(59.9) === "watch" && reservoirTier(30) === "watch" && reservoirTier(29) === "critical", "reservoir tier");

  // op 15: trust and suspect
  const on: ReportType = "water_on", off: ReportType = "water_off";
  console.assert(computeStreetStatus(1, [on, on, off], [on], [on]).trust === "confirmed", "2 of 3 agree -> confirmed");
  console.assert(computeStreetStatus(1, [on, off], [on], [on]).trust === "unconfirmed", "1 of 2 -> unconfirmed");
  console.assert(computeStreetStatus(1, [on], [on, on], [on]).trust === "unconfirmed", "single report -> unconfirmed");
  console.assert(computeStreetStatus(1, [on], [off], [off]).suspect === true, "lone report against both neighbours -> suspect");
  console.assert(computeStreetStatus(1, [on], [off], [on]).suspect === false, "one neighbour agrees -> not suspect");
  console.assert(computeStreetStatus(1, [on], [off], null).suspect === false, "edge street -> never suspect");
  console.assert(computeStreetStatus(1, [on, on], [off], [off]).suspect === false, "two reports -> not suspect");
  console.assert(computeStreetStatus(1, [], [on], [on]).status === null, "no reports -> null status");

  // op 16: likely water time
  const d = (day: number, hour: number) => new Date(2026, 10, day, hour, 15);
  const likely = computeLikelyWaterTime([d(10, 6), d(11, 7), d(12, 13), d(13, 6), d(13, 14)]);
  console.assert(likely?.from === "06:00" && likely?.to === "08:00" && likely?.days_hit === 3 && likely?.days_total === 4, "06-08 slot hit on 3 of 4 days");
  console.assert(computeLikelyWaterTime([d(10, 6), d(11, 6)]) === null, "under 3 days -> null");

  // op 17: priority
  console.assert(computePriority(30, 2).score === 54 && computePriority(30, 2).action === "send tanker", "30 h + 2 waiting");
  console.assert(computePriority(50, 0).action === "place a static tank", "dry > 48 h");
  console.assert(computePriority(10, 0).action === "watch" && computePriority(null, 0).score === 0, "watch / never reported");
  console.log("queries ok");
}

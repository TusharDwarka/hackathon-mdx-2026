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
  console.log("queries ok");
}

// Supabase queries for the demo path (contracts/api.md ops 1, 2, 3, 10, 11) + V2 (12-17)
// + V3 (docs/NEXT-TASK-SPLIT.md, P3): sessions, litres, tanker capacity, dispatch, trust reasons,
// all reservoirs, notices. V5 (docs/SPLIT-V5.md): accounts, requests without litres, places,
// notices + AI parser, rivers, safe-to-drink. Everything is stored by street, never by house or person.
//
// Reads use the anon client (RLS: public read). WRITES go through /api/* route handlers, which check
// the session role and the guest limits on the server (sql/v3.sql). Until sql/v3.sql + the service key
// are deployed, the write wrappers fall back to the old anon insert (labelled "legacy" below).
//
// Every function throws on error: callers catch and fall back to mock data.
// Pure rules are exported next to their query so screens and route handlers share ONE rule.
//
// Self-check of the pure rules (no database needed): npx tsx lib/queries.ts

import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * Through POST /api/reports (guest session started automatically if there is none).
 * Throws ApiError "throttled" (with retry_after_s) when this session already reported the street
 * in the last 30 min. Legacy fallback: anon insert while the API is not deployed.
 */
export async function postReport(streetId: number, type: ReportType): Promise<void> {
  try {
    await ensureGuestSession();
    await api("/api/reports", { method: "POST", body: { street_id: streetId, type } });
  } catch (e) {
    if (!apiNotDeployed(e)) throw e;
    const { error } = await supabase.from("reports").insert({ street_id: streetId, type });
    if (error) throw error;
  }
}

/**
 * "I need a tanker" for the street (V5: one request = one household, no litres) through
 * POST /api/requests. Returns the request id; a repeat click returns the SAME id.
 * Guests may request. The second argument is ignored (old callers that still pass litres).
 */
export async function postRequest(streetId: number, _ignoredLitres?: number): Promise<number> {
  try {
    await ensureGuestSession();
    return (await api<{ id: number; duplicate: boolean }>("/api/requests", { method: "POST", body: { street_id: streetId } })).id;
  } catch (e) {
    if (!apiNotDeployed(e)) throw e;
    const { data, error } = await supabase.from("requests").insert({ street_id: streetId, status: "waiting" }).select("id").single();
    if (error) throw error;
    return data.id;
  }
}

export type MyRequest = {
  id: number; street_id: number; litres: number | null; status: "waiting" | "served"; created_at: string;
  allocated_litres: number; delivered_litres: number;
};
/** This browser session's requests with delivery progress (GET /api/requests). */
export const getMyRequests = () => api<{ requests: MyRequest[] }>("/api/requests").then((r) => r.requests);

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

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = ["no_water", "dirty_water", "tanker_no_show", "other"];

/**
 * V5: signed-in users only (POST /api/complaints with the access token). A guest gets
 * ApiError "sign_in_required" (401) without a network call: show the login.
 * A repeat (same street + category within 6 h) returns the same id.
 */
export async function postComplaint(streetId: number, category: ComplaintCategory): Promise<number> {
  return (await api<{ id: number }>("/api/complaints", { method: "POST", body: { street_id: streetId, category }, auth: true })).id;
}

/** The signed-in user's own complaints, newest first. */
export const getMyComplaints = () =>
  api<{ records: Complaint[] }>("/api/complaints?mine=1", { auth: true }).then((r) => r.records);

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

/** Ops only (PATCH /api/complaints). Throws on failure: the UI keeps the complaint and offers a retry. */
export async function resolveComplaint(complaintId: number): Promise<void> {
  try {
    await api("/api/complaints", { method: "PATCH", body: { id: complaintId, status: "resolved" } });
  } catch (e) {
    if (!apiNotDeployed(e)) throw e;
    const { error } = await supabase.from("complaints").update({ status: "resolved" }).eq("id", complaintId);
    if (error) throw error;
  }
}

export type ComplaintGroup = {
  category: ComplaintCategory; area_id: number | null; status: "open" | "resolved";
  count: number; ids: number[]; street_ids: number[]; latest_at: string;
};

/** Pure: group by category + area (locality) + status, biggest group first. Records stay in `ids`. */
export function groupComplaints(complaints: Complaint[], streetArea: Record<number, number>): ComplaintGroup[] {
  const groups = new Map<string, ComplaintGroup>();
  for (const c of complaints) {
    const area = streetArea[c.street_id] ?? null;
    const key = `${c.category}|${area}|${c.status}`;
    const g = groups.get(key) ?? { category: c.category, area_id: area, status: c.status, count: 0, ids: [], street_ids: [], latest_at: c.created_at };
    g.count++;
    g.ids.push(c.id);
    if (!g.street_ids.includes(c.street_id)) g.street_ids.push(c.street_id);
    if (c.created_at > g.latest_at) g.latest_at = c.created_at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.latest_at.localeCompare(a.latest_at));
}

/** GET /api/complaints: groups for everyone; `records` only for an ops session. */
export const getComplaintGroups = (status: "open" | "all" = "open") =>
  api<{ groups: ComplaintGroup[]; records?: Complaint[] }>(`/api/complaints?status=${status}`);

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

// V3 trust: raw reports are never deleted or relabelled; we return a confidence and reason codes.
// An "independent source" is one guest session (only its latest report counts). Reports without a
// session (seeded demo rows, or written before V3) each count as their own source: "unlinked_reports".
// LIMITATION: a session is a browser cookie, not a person. Clearing cookies gives a new session, so
// this limits casual repeats; it cannot prove that two sources are two different people.
export type TrustReason =
  | "single_source"        // one source only: never confirms an outage
  | "duplicate_source"     // the same session reported more than once: counted once
  | "burst"                // >= 4 reports within 5 minutes on this street: review
  | "conflicting_reports"  // independent sources disagree: review, not "fake"
  | "neighbours_disagree"  // one source, both neighbouring streets say the opposite: context only
  | "unlinked_reports";    // some reports have no session (demo / pre-V3)
export type TrustReport = { type: ReportType; created_at?: string; source: string | null };
export type StreetTrust = StreetStatus & {
  independent_sources: number;
  confidence: "none" | "low" | "medium" | "high";
  reasons: TrustReason[];
  needs_review: boolean;
};

/** Pure: one vote per source (its latest report), oldest first. `reports` must be oldest first. */
export function sourceVotes(reports: TrustReport[]): ReportType[] {
  const latest = new Map<string, { type: ReportType; i: number }>();
  reports.forEach((r, i) => latest.set(r.source ?? `report-${i}`, { type: r.type, i }));
  return [...latest.values()].sort((a, b) => a.i - b.i).map((v) => v.type);
}

/**
 * Pure. `mine`: this street's reports of the last 3 h, oldest first. `prev` / `next`: the
 * neighbouring streets' votes (null when there is no such street).
 * confirmed = >= 2 independent sources and >= 2/3 of them agree.
 */
export function computeStreetTrust(
  streetId: number,
  mine: TrustReport[],
  prev: ReportType[] | null,
  next: ReportType[] | null
): StreetTrust {
  const votes = sourceVotes(mine);
  const status = majority(votes);
  const agree = status ? votes.filter((t) => t === status).length : 0;
  const trust = votes.length >= 2 && agree / votes.length >= 2 / 3 ? "confirmed" : "unconfirmed";
  const p = prev ? majority(prev) : null;
  const n = next ? majority(next) : null;
  const neighbours = votes.length === 1 && p !== null && n !== null && p !== status && n !== status;

  const times = mine.map((r) => (r.created_at ? new Date(r.created_at).getTime() : NaN)).filter((t) => !isNaN(t)).sort((a, b) => a - b);
  const burst = times.some((t, i) => i >= 3 && t - times[i - 3] <= 5 * 60_000);
  const reasons: TrustReason[] = [];
  if (votes.length === 1) reasons.push("single_source");
  if (mine.length > votes.length) reasons.push("duplicate_source");
  if (burst) reasons.push("burst");
  if (new Set(votes).size > 1) reasons.push("conflicting_reports");
  if (neighbours) reasons.push("neighbours_disagree");
  if (mine.some((r) => r.source === null)) reasons.push("unlinked_reports");

  const confidence = votes.length === 0 ? "none" : trust === "unconfirmed" ? "low" : votes.length >= 3 && !burst ? "high" : "medium";
  const needs_review = neighbours || burst || (trust === "unconfirmed" && reasons.includes("conflicting_reports"));
  return { street_id: streetId, status, trust, suspect: neighbours, reports: mine.length, independent_sources: votes.length, confidence, reasons, needs_review };
}

/**
 * Pure, V2 shape (kept for existing callers). `mine`: this street's report types in the last 3 h,
 * oldest first; each report counts as its own source. suspect = exactly 1 report and both
 * neighbours contradict it. Same rule as computeStreetTrust.
 */
export function computeStreetStatus(
  streetId: number,
  mine: ReportType[],
  prev: ReportType[] | null,
  next: ReportType[] | null
): StreetStatus {
  const t = computeStreetTrust(streetId, mine.map((type) => ({ type, source: null })), prev, next);
  return { street_id: t.street_id, status: t.status, trust: t.trust, suspect: t.suspect, reports: t.reports };
}

/**
 * Pure: trust for every street in route order. `sourceOf(report)` = its session id or null.
 * Used by GET /api/status (with sessions) and getStreetStatuses (anon, no sessions).
 */
export function computeAllStreetTrust(
  streets: Pick<Street, "id" | "order_index">[],
  reports: { street_id: number; type: ReportType; created_at: string; source: string | null }[]
): Record<number, StreetTrust> {
  const ordered = [...streets].sort((a, b) => a.order_index - b.order_index);
  const byStreet: Record<number, TrustReport[]> = {};
  for (const r of [...reports].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    (byStreet[r.street_id] ??= []).push({ type: r.type, created_at: r.created_at, source: r.source });
  }
  const votes = (id: number | undefined) => (id === undefined ? null : sourceVotes(byStreet[id] ?? []));
  const out: Record<number, StreetTrust> = {};
  ordered.forEach((s, i) => {
    out[s.id] = computeStreetTrust(s.id, byStreet[s.id] ?? [], votes(ordered[i - 1]?.id), votes(ordered[i + 1]?.id));
  });
  return out;
}

/**
 * Status with trust for every street, from the anon client: no session data, so every report counts
 * as its own source. Prefer getTrustStatuses() (GET /api/status), which de-duplicates by session.
 */
export async function getStreetStatuses(areaId?: number, now = new Date()): Promise<Record<number, StreetTrust>> {
  const streets = await getStreets(areaId);
  const since = new Date(now.getTime() - STATUS_WINDOW_H * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("reports")
    .select("street_id,type,created_at")
    .in("street_id", streets.map((s) => s.id))
    .gte("created_at", since)
    .order("created_at");
  if (error) throw error;
  return computeAllStreetTrust(streets, (data ?? []).map((r) => ({ ...r, type: r.type as ReportType, source: null })));
}

export async function getStreetStatus(streetId: number, now = new Date()): Promise<StreetStatus> {
  const all = await getStreetStatuses(undefined, now);
  return all[streetId] ?? computeStreetStatus(streetId, [], null, null);
}

/** GET /api/status: trust per street, de-duplicated by guest session on the server. */
export const getTrustStatuses = () => api<{ window_hours: number; statuses: Record<number, StreetTrust> }>("/api/status");

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
export type PriorityRow = {
  street_id: number; name: string; hours_dry: number | null; waiting: number; score: number; action: PriorityAction;
  dry_known: boolean;           // false = no water_on report on record: NOT the same as 0 h dry
  reasons: string[];            // why this rank and this action, in plain words for /ops
};

/**
 * Pure: score = hours dry + 12 x waiting requests (contract op 17). A street that never reported
 * water adds 0 h to the score, and the reasons say "dryness unknown" instead of showing 0 h.
 */
export function explainPriority(hoursDry: number | null, waiting: number) {
  const dry = hoursDry ?? 0;
  const score = Math.round(dry + 12 * waiting);
  const action: PriorityAction = waiting > 0 ? "send tanker" : dry > 48 ? "place a static tank" : "watch";
  const reasons: string[] = [];
  if (waiting > 0) reasons.push(`${waiting} household${waiting > 1 ? "s" : ""} waiting for a tanker`);
  if (hoursDry === null) reasons.push("no water report on record: dryness unknown (adds 0 to the score)");
  else reasons.push(`last water reported ${Math.round(hoursDry)} h ago`);
  if (action === "place a static tank") reasons.push("dry for more than 48 h with no request waiting");
  return { score, action, dry_known: hoursDry !== null, reasons };
}

/** Pure, V2 shape (kept for existing callers). */
export function computePriority(hoursDry: number | null, waiting: number): { score: number; action: PriorityAction } {
  const { score, action } = explainPriority(hoursDry, waiting);
  return { score, action };
}

/** Pure: rows for every street, highest score first. */
export function priorityRows(
  streets: Pick<Street, "id" | "name">[],
  hoursDry: Record<number, number | null>,
  waiting: { street_id: number }[]
): PriorityRow[] {
  const count: Record<number, number> = {};
  for (const r of waiting) count[r.street_id] = (count[r.street_id] ?? 0) + 1;
  return streets
    .map((s) => {
      const h = hoursDry[s.id] ?? null, w = count[s.id] ?? 0;
      return { street_id: s.id, name: s.name, hours_dry: h, waiting: w, ...explainPriority(h, w) };
    })
    .sort((a, b) => b.score - a.score);
}

/** All streets sorted by score, highest first (anon read). waiting = households. */
export async function getPriorityList(areaId?: number, now = new Date()): Promise<PriorityRow[]> {
  const streets = await getStreets(areaId);
  const [hours, { data: waiting, error }] = await Promise.all([
    getHoursDry(areaId, now),
    supabase.from("requests").select("street_id").eq("status", "waiting").in("street_id", streets.map((s) => s.id)),
  ]);
  if (error) throw error;
  return priorityRows(streets, hours, waiting ?? []);
}

// =====================================================================================
// V3 (docs/NEXT-TASK-SPLIT.md, P3). Proposed contract: team/p3-backend/CONTRACT-V3-PROPOSAL.md
// =====================================================================================

// ---------- input validation (same rules on the client and in /api/*) ----------

export const LITRES_PER_M3 = 1000;
/** DEMO, ops-side: litres planned per waiting household. Same as kd_household_litres() in sql/v5.sql. */
export const HOUSEHOLD_L = 20;
export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const obj = (b: unknown): Record<string, unknown> | null => (b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null);

export function validateReportInput(body: unknown): Valid<{ street_id: number; type: ReportType }> {
  const b = obj(body);
  if (!b || !isId(b.street_id)) return { ok: false, error: "invalid_street_id" };
  if (b.type !== "water_on" && b.type !== "water_off") return { ok: false, error: "invalid_type" };
  return { ok: true, value: { street_id: b.street_id, type: b.type } };
}

/** V5: only the street. Any `litres` a resident sends is ignored (tank size is an ops value). */
export function validateRequestInput(body: unknown): Valid<{ street_id: number }> {
  const b = obj(body);
  if (!b || !isId(b.street_id)) return { ok: false, error: "invalid_street_id" };
  return { ok: true, value: { street_id: b.street_id } };
}

export function validateComplaintInput(body: unknown): Valid<{ street_id: number; category: ComplaintCategory }> {
  const b = obj(body);
  if (!b || !isId(b.street_id)) return { ok: false, error: "invalid_street_id" };
  if (!COMPLAINT_CATEGORIES.includes(b.category as ComplaintCategory)) return { ok: false, error: "invalid_category" };
  return { ok: true, value: { street_id: b.street_id, category: b.category as ComplaintCategory } };
}

export function validatePositionInput(body: unknown): Valid<{ round_id: number; lat: number; lng: number }> {
  const b = obj(body);
  if (!b || !isId(b.round_id)) return { ok: false, error: "invalid_round_id" };
  const ok = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
  if (!ok(b.lat, 90) || !ok(b.lng, 180)) return { ok: false, error: "invalid_position" };
  return { ok: true, value: { round_id: b.round_id, lat: b.lat as number, lng: b.lng as number } };
}

// ---------- tanker capacity planning ----------
// Words: a LOAD is one full tank (one departure of one tanker). A TANKER is a physical truck.
// 6 places x 20 L = 120 L at 100 L per tank = 2 loads: either 2 tankers leaving at once, or
// 1 tanker doing 2 trips (a refill in between) if time allows. This plan does not check time windows.

/** Pure: minimum number of loads for `totalLitres` with split delivery. Rejects capacity <= 0. */
export function loadsNeeded(totalLitres: number, capacityLitres: number): number {
  if (!Number.isFinite(capacityLitres) || capacityLitres <= 0) throw new RangeError("capacity must be a positive number of litres");
  if (!Number.isFinite(totalLitres) || totalLitres < 0) throw new RangeError("total litres must be 0 or more");
  return Math.ceil(totalLitres / capacityLitres);
}

/** One waiting request's OUTSTANDING litres (litres minus what is already on a load). */
export type DemandItem = { request_id: number; street_id: number; order_index: number; litres: number; created_at?: string };
export type PlannedStop = { street_id: number; litres: number; requests: { request_id: number; litres: number }[] };
export type PlannedLoad = { load_no: number; tanker_no: number | null; trip_no: number | null; litres: number; stops: PlannedStop[] };
export type DispatchPlan = {
  capacity_litres: number;
  split: boolean;
  total_litres: number;                 // all outstanding demand, including infeasible requests
  loads_needed: number;                 // loads this plan uses
  min_loads: number;                    // ceil(total / capacity): a lower bound, not proof of fleet size
  tankers_available: number;
  max_trips_per_tanker: number;
  tankers_for_one_departure: number;    // = loads_needed: every load leaves at once, no refill
  refill_trips_needed: number;          // loads beyond the first departure of each available tanker
  assigned_litres: number;              // on loads that fit the fleet x max trips
  unmet_litres: number;                 // not on any assignable load (needs more tankers or more trips)
  feasible: boolean;                    // unmet_litres === 0
  loads: PlannedLoad[];
  infeasible: { request_id: number; litres: number; reason: "larger_than_tank_without_split" }[];
  assumptions: string[];
};

/**
 * Pure. Fills loads one after another in street order (order_index, then oldest request), exactly
 * like kd_allocate_load in sql/v3.sql. split = true: a request bigger than the space left is split
 * across loads and each part is tracked. split = false: it waits for a load where it fits whole;
 * a request bigger than a whole tank is returned as infeasible, never overfilled.
 * Load k goes to tanker (k mod tankers) + 1, trip floor(k / tankers) + 1; trips above
 * maxTripsPerTanker stay unassigned and their litres are unmet.
 */
export function planDispatch(
  demand: DemandItem[],
  opts: { capacityLitres: number; tankers: number; maxTripsPerTanker?: number; split?: boolean }
): DispatchPlan {
  const cap = opts.capacityLitres;
  loadsNeeded(0, cap); // validates capacity
  const tankers = Math.max(0, Math.floor(opts.tankers));
  const maxTrips = Math.max(1, Math.floor(opts.maxTripsPerTanker ?? 1));
  const split = opts.split ?? true;

  const queue = [...demand]
    .filter((d) => d.litres > 0)
    .sort((a, b) => a.order_index - b.order_index || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.request_id - b.request_id);
  const infeasible = split ? [] : queue.filter((d) => d.litres > cap).map((d) => ({ request_id: d.request_id, litres: d.litres, reason: "larger_than_tank_without_split" as const }));
  const left = new Map(queue.filter((d) => split || d.litres <= cap).map((d) => [d.request_id, d.litres]));

  const loads: PlannedLoad[] = [];
  while ([...left.values()].some((l) => l > 0)) {
    let space = cap;
    const stops: PlannedStop[] = [];
    for (const d of queue) {
      const need = left.get(d.request_id) ?? 0;
      if (space <= 0) break;
      if (need <= 0 || (!split && need > space)) continue;
      const take = Math.min(need, space);
      let stop = stops[stops.length - 1];
      if (!stop || stop.street_id !== d.street_id) stops.push((stop = { street_id: d.street_id, litres: 0, requests: [] }));
      stop.litres += take;
      stop.requests.push({ request_id: d.request_id, litres: take });
      left.set(d.request_id, need - take);
      space -= take;
    }
    const k = loads.length;
    const trip = tankers > 0 ? Math.floor(k / tankers) + 1 : null;
    const assignable = trip !== null && trip <= maxTrips;
    loads.push({ load_no: k + 1, tanker_no: assignable ? (k % tankers) + 1 : null, trip_no: assignable ? trip : null, litres: cap - space, stops });
  }

  const total = demand.reduce((s, d) => s + Math.max(0, d.litres), 0);
  const assigned = loads.filter((l) => l.tanker_no !== null).reduce((s, l) => s + l.litres, 0);
  const unmet = total - assigned;
  return {
    capacity_litres: cap,
    split,
    total_litres: total,
    loads_needed: loads.length,
    min_loads: loadsNeeded(total, cap),
    tankers_available: tankers,
    max_trips_per_tanker: maxTrips,
    tankers_for_one_departure: loads.length,
    refill_trips_needed: Math.max(0, loads.length - tankers),
    assigned_litres: assigned,
    unmet_litres: unmet,
    feasible: unmet === 0,
    loads,
    infeasible,
    assumptions: [
      `Every tanker carries ${cap} L (same capacity for all; demo value unless set by ops).`,
      split
        ? "Split delivery: a request bigger than the space left on a load is split, and each part is tracked."
        : "No split: a request travels whole on one load; a request bigger than one tank is listed as infeasible.",
      `At most ${maxTrips} trip${maxTrips > 1 ? "s" : ""} per tanker; a refill between trips is assumed possible but its time is not checked.`,
      "Stops follow street order (order_index), then the oldest request first.",
      "Litres throughout; 1 m3 = 1,000 L.",
    ],
  };
}

// ---------- dispatch, rounds, tankers (client calls; server rules in sql/v3.sql) ----------

export type Tanker = { id: number; name: string; capacity_litres: number; active: boolean };
export type RoundView = {
  id: number; status: "planned" | "active" | "done"; started_at: string;
  tanker: Pick<Tanker, "id" | "name" | "capacity_litres"> | null;
  litres: number;
  stops: { id: number; street_id: number; street_name: string; stop_order: number; served_at: string | null; litres: number }[];
};
export type DispatchPreview = { plan: DispatchPlan; tankers: (Tanker & { busy: boolean })[]; households: number; household_litres: number };

export async function getTankers(): Promise<Tanker[]> {
  const { data, error } = await supabase.from("tankers").select("id,name,capacity_litres,active").order("id");
  if (error) throw error;
  return data ?? [];
}

/** Ops: preview from live demand. Overrides are for "what if" (e.g. capacity 100, 1 tanker). */
export function getDispatchPlan(o: { capacity?: number; tankers?: number; maxTrips?: number; split?: boolean } = {}) {
  const q = new URLSearchParams();
  if (o.capacity !== undefined) q.set("capacity", String(o.capacity));
  if (o.tankers !== undefined) q.set("tankers", String(o.tankers));
  if (o.maxTrips !== undefined) q.set("max_trips", String(o.maxTrips));
  if (o.split !== undefined) q.set("split", String(o.split));
  return api<DispatchPreview>(`/api/dispatch?${q}`);
}

/** Ops: put one load on a tanker. Reuse the same `dispatchKey` on retry: it never allocates twice. */
export const confirmDispatch = (tankerId: number, dispatchKey: string, split = true) =>
  api<{ round_id: number; duplicate: boolean; litres?: number; round: RoundView | null }>("/api/dispatch", {
    method: "POST", body: { tanker_id: tankerId, dispatch_key: dispatchKey, split },
  });

/** Driver session: its own open round (or null). Anyone else: every open round, or those stopping on `streetId`. */
export function getRounds(streetId?: number) {
  return api<{ role: string | null; rounds: RoundView[] }>(`/api/rounds${streetId ? `?street_id=${streetId}` : ""}`);
}
type RoundAction =
  | { action: "start" }
  | { action: "serve"; round_stop_id: number }
  | { action: "end"; round_id: number }
  | { action: "position"; round_id: number; lat: number; lng: number }
  | { action: "cancel"; round_id: number }; // ops only
export const roundAction = (body: RoundAction) => api<Record<string, unknown> & { round?: RoundView | null }>("/api/rounds", { method: "POST", body });

// ---------- all reservoirs (latest reading each; missing ones stay visible) ----------

/** The main monitored reservoirs of Mauritius (names as stored after scripts/load-data.ts). */
export const MAIN_RESERVOIRS = ["Mare aux Vacoas", "Midlands Dam", "La Nicoliere", "Piton du Milieu", "La Ferme", "Mare Longue", "Bagatelle Dam"];
export const RESERVOIR_STALE_DAYS = 14;
export type ReservoirReading = { reservoir: string; day: string; level_pct: number; source_url: string | null; date_basis: string | null; is_aggregate: boolean };
export type ReservoirLatest =
  | (ReservoirReading & { state: "current" | "stale"; tier: ReservoirTier; age_days: number })
  | { reservoir: string; state: "missing" };

/** Pure: latest reading per reservoir. Stale = older than 14 days. A listed reservoir with no reading is "missing". */
export function latestReservoirs(rows: ReservoirReading[], now = new Date()): { reservoirs: ReservoirLatest[]; aggregate: ReservoirLatest | null } {
  const latest = new Map<string, ReservoirReading>();
  for (const r of rows) {
    const cur = latest.get(r.reservoir);
    if (!cur || r.day > cur.day) latest.set(r.reservoir, r);
  }
  const view = (r: ReservoirReading): ReservoirLatest => {
    const age = Math.floor((now.getTime() - new Date(`${r.day}T00:00:00`).getTime()) / 86_400_000);
    return { ...r, tier: reservoirTier(r.level_pct), age_days: age, state: age > RESERVOIR_STALE_DAYS ? "stale" : "current" };
  };
  const named = [...latest.values()].filter((r) => !r.is_aggregate);
  const names = [...new Set([...MAIN_RESERVOIRS, ...named.map((r) => r.reservoir)])];
  const agg = [...latest.values()].find((r) => r.is_aggregate);
  return {
    reservoirs: names.map((n) => (latest.has(n) && !latest.get(n)!.is_aggregate ? view(latest.get(n)!) : { reservoir: n, state: "missing" as const })),
    aggregate: agg ? view(agg) : null,
  };
}

export const getReservoirs = () => api<ReturnType<typeof latestReservoirs> & { thresholds: string }>("/api/reservoirs");

// ---------- official notices / advisories, supply volumes ----------

export type NoticeKind = "interruption" | "rationing" | "advisory";
export type Notice = {
  id: number; kind: NoticeKind; topic: string | null; locality: string; area_id: number | null;
  starts_at: string | null; ends_at: string | null; title: string; source_url: string; source_date: string;
};
export type SupplyVolume = { locality: string; area_id: number | null; volume_m3: number; period_start: string; period_end: string; source_url: string };
export const NOTICE_OPEN_ENDED_DAYS = 30; // a notice with no end date counts as current for 30 days after its source date
export const NO_ADVISORY_TEXT = "No verified local advisory available. This does not mean the water is safe or unsafe to drink.";

/** Pure: split notices into active / upcoming / expired. Never invents an end date silently. */
export function classifyNotices(rows: Notice[], now = new Date()) {
  const t = now.getTime();
  const active: (Notice & { open_ended: boolean })[] = [], upcoming: Notice[] = [];
  let expired = 0;
  for (const n of rows) {
    const start = n.starts_at ? new Date(n.starts_at).getTime() : new Date(`${n.source_date}T00:00:00`).getTime();
    const end = n.ends_at ? new Date(n.ends_at).getTime() : new Date(`${n.source_date}T00:00:00`).getTime() + NOTICE_OPEN_ENDED_DAYS * 86_400_000;
    if (start > t) upcoming.push(n);
    else if (end >= t) active.push({ ...n, open_ended: !n.ends_at });
    else expired++;
  }
  const hasAdvisory = active.some((n) => n.kind === "advisory");
  return { active, upcoming, expired_count: expired, advisory_message: hasAdvisory ? null : NO_ADVISORY_TEXT };
}

export const getNotices = (areaId?: number) =>
  api<ReturnType<typeof classifyNotices> & { supply: SupplyVolume[]; unmapped_localities: string[] }>(`/api/notices${areaId ? `?area_id=${areaId}` : ""}`);

/** Pure: match a source locality name to a known area ("Vacoas" = "vacoas" = "Vacoas "). null = unmapped, never guessed. */
export function matchArea(locality: string, areas: Area[]): number | null {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  const key = norm(locality);
  return areas.find((a) => norm(a.name) === key)?.id ?? null;
}

// =====================================================================================
// V4 water day (docs/WATER-DAY-SPLIT.md, P3): op 24 forecast, 25 reservoir trend, 26 quality, 27 planner.
// Every forecast is an ESTIMATE, says what it is based on, and never overrides an official CWA window.
// Nothing here says tap water is safe or unsafe to drink.
// Each op: a pure rule + an async loader taking a Supabase client (anon by default; routes pass db()).
// =====================================================================================

const DAY_MS = 86_400_000;
const isIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
/** "YYYY-MM-DD" -> local midnight of that day. */
function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function midnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
const shortDate = (s: string) => parseDay(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); // "10 Oct"

/**
 * Mauritius wall-clock time as a Date whose LOCAL fields read Mauritius time (UTC+4, no DST).
 * Servers (Vercel) run in UTC: without this, "tomorrow" is wrong between 00:00 and 04:00 in Mauritius.
 */
export function mauritiusNow(at = new Date()): Date {
  return new Date(at.getTime() + (240 + at.getTimezoneOffset()) * 60_000);
}

/** District of each supported locality, to find its district-level CWA notices. null = unknown, never guessed. */
export const AREA_DISTRICT: Record<string, string> = { Vacoas: "Plaines-Wilhems" };
export const districtOf = (area: string): string | null => AREA_DISTRICT[area.trim()] ?? null;

/** Which reservoir feeds an area. Demo: Vacoas (and any area we do not know) -> Mare aux Vacoas. */
export const AREA_RESERVOIR: Record<string, string> = { Vacoas: "Mare aux Vacoas" };
export const DEFAULT_RESERVOIR = "Mare aux Vacoas";

/** Pure: tier of the latest reading, or null when there is none or it is stale (> 14 days). */
export function currentTier(latest: { day: string; level_pct: number } | null, now = new Date()): ReservoirTier | null {
  if (!latest) return null;
  const age = Math.round((midnight(now).getTime() - parseDay(latest.day).getTime()) / DAY_MS);
  return age > RESERVOIR_STALE_DAYS ? null : reservoirTier(latest.level_pct);
}

async function areaReservoir(areaId: number, client: SupabaseClient): Promise<string> {
  const { data, error } = await client.from("areas").select("name").eq("id", areaId).maybeSingle();
  if (error) throw error;
  return AREA_RESERVOIR[data?.name ?? ""] ?? DEFAULT_RESERVOIR;
}

export async function areaTier(areaId: number, now = new Date(), client: SupabaseClient = supabase): Promise<ReservoirTier | null> {
  const reservoir = await areaReservoir(areaId, client);
  const { data, error } = await client.from("reservoir_levels").select("day,level_pct").eq("reservoir", reservoir).order("day", { ascending: false }).limit(1);
  if (error) throw error;
  return currentTier(data?.[0] ?? null, now);
}

// ---------- op 24: next water window forecast ----------

export type ForecastBasis = "official" | "every_second_day" | "history";
export type Forecast = {
  next: { day: string; start_time: string; end_time: string }; // day = "YYYY-MM-DD"
  basis: ForecastBasis;
  confidence: "high" | "medium" | "low"; // official = high
  tier: ReservoirTier | null;
  note: string;
  source_url: string | null;
};
type ScheduleRow = Pick<Window, "day" | "start_time" | "end_time" | "source_url" | "source_date">;

function tierNote(tier: ReservoirTier | null): string | null {
  return tier === "critical" ? "reservoir critical, cuts may get longer"
    : tier === "watch" ? "reservoir at watch level"
    : tier === "normal" ? "reservoir at normal level" : null;
}

/**
 * Pure. In order:
 * 1. official: the earliest timetable window on or after tomorrow (dated row, or the next weekday
 *    for a "Mon".."Sun" row) -> high.
 * 2. every_second_day: the last 3 dated windows are 2 days apart -> last day + 2, + 2 ... until after
 *    today, same times -> medium (low when the reservoir tier is critical).
 * 3. history: op 16 likely time, for tomorrow -> low.
 * null when none applies.
 */
export function computeForecast(rows: ScheduleRow[], tier: ReservoirTier | null, likely: LikelyWaterTime | null, now = new Date()): Forecast | null {
  const today = midnight(now);
  const tomorrow = addDays(today, 1);
  const note = (s: string) => [s, tierNote(tier)].filter(Boolean).join("; ");
  const at = (day: Date, r: Pick<ScheduleRow, "start_time" | "end_time">) => ({ day: isoDate(day), start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) });

  let best: { date: Date; row: ScheduleRow } | null = null;
  for (const r of rows) {
    let date: Date | null = null;
    if (isIsoDay(r.day)) {
      const d = parseDay(r.day);
      if (d >= tomorrow) date = d;
    } else if (DAY_NAMES.includes(r.day)) {
      date = addDays(tomorrow, (DAY_NAMES.indexOf(r.day) - tomorrow.getDay() + 7) % 7);
    }
    if (!date) continue;
    if (!best || date < best.date || (date.getTime() === best.date.getTime() && hhmm(r.start_time) < hhmm(best.row.start_time))) best = { date, row: r };
  }
  if (best) {
    const published = best.row.source_date ? ` (published ${shortDate(best.row.source_date)})` : "";
    return { next: at(best.date, best.row), basis: "official", confidence: "high", tier, note: note(`Official CWA timetable${published}`), source_url: best.row.source_url };
  }

  const dated = rows.filter((r) => isIsoDay(r.day)).sort((a, b) => a.day.localeCompare(b.day));
  const gap = (a: ScheduleRow, b: ScheduleRow) => Math.round((parseDay(b.day).getTime() - parseDay(a.day).getTime()) / DAY_MS);
  const n = dated.length;
  if (n >= 3 && gap(dated[n - 3], dated[n - 2]) === 2 && gap(dated[n - 2], dated[n - 1]) === 2) {
    let first = n - 1;
    while (first > 0 && gap(dated[first - 1], dated[first]) === 2) first--;
    const last = dated[n - 1];
    let d = parseDay(last.day);
    while (d <= today) d = addDays(d, 2);
    return {
      next: at(d, last),
      basis: "every_second_day",
      confidence: tier === "critical" ? "low" : "medium",
      tier,
      note: note(`Estimate: every second day since ${shortDate(dated[first].day)}, last official day ${shortDate(last.day)}`),
      source_url: last.source_url,
    };
  }

  if (likely) {
    return {
      next: { day: isoDate(tomorrow), start_time: likely.from, end_time: likely.to },
      basis: "history",
      confidence: "low",
      tier,
      note: note(`Estimate from resident reports: water came in this slot on ${likely.days_hit} of ${likely.days_total} days`),
      source_url: null,
    };
  }
  return null;
}

/** Op 16 for a whole area: water_on reports of its streets over the last 14 days. */
async function areaLikelyTime(areaId: number, now: Date, client: SupabaseClient): Promise<LikelyWaterTime | null> {
  const { data: streets, error: se } = await client.from("streets").select("id").eq("area_id", areaId);
  if (se) throw se;
  const { data, error } = await client
    .from("reports")
    .select("created_at")
    .eq("type", "water_on")
    .in("street_id", (streets ?? []).map((s) => s.id))
    .gte("created_at", addDays(now, -14).toISOString());
  if (error) throw error;
  return computeLikelyWaterTime((data ?? []).map((r) => new Date(r.created_at)));
}

export async function forecastNext(areaId: number, now = new Date(), client: SupabaseClient = supabase): Promise<Forecast | null> {
  const [{ data: rows, error }, tier] = await Promise.all([
    client.from("schedule").select("day,start_time,end_time,source_url,source_date").eq("area_id", areaId),
    areaTier(areaId, now, client),
  ]);
  if (error) throw error;
  return computeForecast(rows ?? [], tier, null, now) ?? computeForecast([], tier, await areaLikelyTime(areaId, now, client), now);
}

// ---------- op 25: reservoir trend (least squares) ----------

export type TrendPoint = { day: string; level_pct: number };
export type Trend = {
  reservoir: string; latest_pct: number; latest_day: string;
  pct_per_day: number;                                    // negative = falling (least-squares slope)
  days_to_30: number | null; days_to_20: number | null;  // from today; null if rising or < 3 points
  reaches_30_on: string | null; reaches_20_on: string | null;
  points: TrendPoint[];                                   // readings used, oldest first
  projection: TrendPoint[];                               // today + next 30 days, on the fitted line
};
export const TREND_WINDOW_DAYS = 90; // readings older than this are left out (another season)

/**
 * Pure: least-squares line through the readings (one per day), projected from today for 30 days.
 * days_to_X = whole days from today until the line reaches X% (0 if already there).
 * An ESTIMATE: a straight line ignores rain, so the UI shows it next to the press figures.
 */
export function reservoirTrend(points: TrendPoint[], now = new Date(), reservoir = ""): Trend | null {
  const byDay = new Map<string, number>();
  for (const p of points) if (Number.isFinite(p.level_pct)) byDay.set(p.day.slice(0, 10), p.level_pct);
  const pts = [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, level_pct]) => ({ day, level_pct }));
  if (!pts.length) return null;
  const t0 = parseDay(pts[0].day).getTime();
  const xs = pts.map((p) => Math.round((parseDay(p.day).getTime() - t0) / DAY_MS));
  const ys = pts.map((p) => p.level_pct);
  const n = pts.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = n >= 2 && sxx > 0 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  const intercept = my - slope * mx;
  const today = midnight(now);
  const xNow = Math.round((today.getTime() - t0) / DAY_MS);
  const reach = (target: number) => (n < 3 || slope >= 0 ? null : Math.max(0, Math.ceil((target - intercept) / slope - xNow)));
  const d30 = reach(30), d20 = reach(20);
  const last = pts[n - 1];
  return {
    reservoir,
    latest_pct: last.level_pct,
    latest_day: last.day,
    pct_per_day: Math.round(slope * 1000) / 1000,
    days_to_30: d30,
    days_to_20: d20,
    reaches_30_on: d30 === null ? null : isoDate(addDays(today, d30)),
    reaches_20_on: d20 === null ? null : isoDate(addDays(today, d20)),
    points: pts,
    projection: n >= 2
      ? Array.from({ length: 31 }, (_, i) => ({ day: isoDate(addDays(today, i)), level_pct: Math.round(Math.min(100, Math.max(0, intercept + slope * (xNow + i))) * 10) / 10 }))
      : [],
  };
}

/** Trend of one reservoir, or of every single reservoir when `reservoir` is omitted (aggregate left out). */
export async function reservoirTrends(reservoir?: string, now = new Date(), client: SupabaseClient = supabase): Promise<Trend[]> {
  let q = client
    .from("reservoir_levels")
    .select("reservoir,day,level_pct")
    .eq("is_aggregate", false)
    .gte("day", isoDate(addDays(now, -TREND_WINDOW_DAYS)))
    .order("day");
  if (reservoir) q = q.eq("reservoir", reservoir);
  const { data, error } = await q;
  if (error) throw error;
  const by = new Map<string, TrendPoint[]>();
  for (const r of data ?? []) by.set(r.reservoir, [...(by.get(r.reservoir) ?? []), { day: r.day, level_pct: r.level_pct }]);
  return [...by].map(([name, pts]) => reservoirTrend(pts, now, name)).filter((t): t is Trend => t !== null);
}

// ---------- op 26: water quality caution (fixed strings, no drinkability claim) ----------

export type QualityLevel = "none" | "cloudy_possible" | "official_notice";
export type QualityNotice = { title: string; day: string; category: "boil" | "quality"; source_url: string };
export type Quality = { level: QualityLevel; message: string; notice?: { title: string; day: string; source_url: string } };
export const QUALITY_NOTICE_DAYS = 14; // an official quality notice counts as current for 14 days after its date
export const QUALITY_MESSAGES = {
  none: "No official water quality notice for this area. Follow official CWA and Ministry of Health advice.",
  cloudy_possible: "When reservoirs are low, tap water can look cloudy. Report dirty water. Follow official CWA / Ministry of Health advice.",
  boil: "An official notice asks residents of this area to boil water before drinking. Read the notice for details.",
  quality: "An official notice about water quality covers this area. Read the notice and follow its advice.",
} as const;

/** Pure: a current official notice wins (boil first, then newest); else a low reservoir tier -> cloudy caution. */
export function computeWaterQuality(notices: QualityNotice[], tier: ReservoirTier | null, now = new Date()): Quality {
  const today = midnight(now).getTime();
  const current = notices
    .filter((n) => {
      const age = (today - parseDay(n.day).getTime()) / DAY_MS;
      return age >= 0 && age <= QUALITY_NOTICE_DAYS && !!n.source_url;
    })
    .sort((a, b) => (a.category === b.category ? b.day.localeCompare(a.day) : a.category === "boil" ? -1 : 1));
  const n = current[0];
  if (n) return { level: "official_notice", message: QUALITY_MESSAGES[n.category], notice: { title: n.title, day: n.day, source_url: n.source_url } };
  if (tier === "watch" || tier === "critical") return { level: "cloudy_possible", message: QUALITY_MESSAGES.cloudy_possible };
  return { level: "none", message: QUALITY_MESSAGES.none };
}

/** Needs sql/v4.sql (quality_notices). Island-wide notices apply to every area. */
export async function waterQuality(areaId: number, now = new Date(), client: SupabaseClient = supabase): Promise<Quality> {
  const [{ data, error }, tier] = await Promise.all([
    client.from("quality_notices").select("title,day,category,source_url").or(`area_id.eq.${areaId},island_wide.eq.true`),
    areaTier(areaId, now, client),
  ]);
  if (error) throw error;
  return computeWaterQuality((data ?? []) as QualityNotice[], tier, now);
}

// ---------- op 27: water-day planner (pure, no IO) ----------

export type PlanStep = { time: string; label: string; kind: "remind" | "arrive" | "task" | "end"; offset: number }; // offset = minutes from the window start (reminder = -30)

/**
 * Pure. Reminder 30 min before the window, water arrives at the start. Default tasks: fill the tank
 * at the start, washing machine at start + 3 h if that is before end - 30 min, finish laundry at
 * end - 30 min. Custom `tasks` are spread evenly from the start to end - 30 min. A window that ends
 * at or before its start crosses midnight (22:00-02:00).
 */
export function planDay(window: { start_time: string; end_time: string }, tasks?: string[]): PlanStep[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (m: number) => {
    const x = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  };
  const start = toMin(window.start_time);
  let end = toMin(window.end_time);
  if (end <= start) end += 1440;
  const lastTask = Math.max(start, end - 30);
  const steps: { m: number; label: string; kind: PlanStep["kind"] }[] = [
    { m: start - 30, label: "Water in 30 minutes. Start the pump.", kind: "remind" },
    { m: start, label: "Water arrives", kind: "arrive" },
  ];
  if (!tasks) {
    steps.push({ m: start, label: "Fill the tank", kind: "task" });
    if (start + 180 < end - 30) steps.push({ m: start + 180, label: "Washing machine", kind: "task" });
    if (end - 30 > start) steps.push({ m: end - 30, label: "Finish laundry before the water stops", kind: "task" });
  } else {
    tasks.forEach((label, i) => {
      const m = tasks.length === 1 ? start : Math.round(start + (i * (lastTask - start)) / (tasks.length - 1));
      steps.push({ m, label, kind: "task" });
    });
  }
  steps.push({ m: end, label: "Water ends", kind: "end" });
  return steps.sort((a, b) => a.m - b.m).map((s) => ({ time: fmt(s.m), label: s.label, kind: s.kind, offset: s.m - start }));
}

// ---------- V4 client calls (routes fall back to labelled demo data; `demo: true`) ----------

export const getForecast = (areaId?: number) =>
  api<(Forecast & { demo: boolean }) | null>(`/api/forecast${areaId ? `?area_id=${areaId}` : ""}`);
export const getReservoirTrend = (reservoir = DEFAULT_RESERVOIR) =>
  api<(Trend & { demo: boolean }) | null>(`/api/reservoirs/trend?reservoir=${encodeURIComponent(reservoir)}`);
export const getReservoirTrendsAll = () => api<{ trends: Trend[]; demo: boolean }>("/api/reservoirs/trend?reservoir=all");
export const getWaterQuality = (areaId?: number) =>
  api<Quality & { demo: boolean }>(`/api/quality${areaId ? `?area_id=${areaId}` : ""}`);

// ---------- sessions (guest / driver / ops) ----------

export type Role = "guest" | "driver" | "ops";
export type SessionInfo = { role: Role | null; tanker_id: number | null; expires_at: string | null; demo_access?: boolean };

export const getSession = () => api<SessionInfo>("/api/session");
/** "Continue as guest": read-only browsing needs no session; reports/requests/complaints do. */
export const startGuestSession = () => api<SessionInfo>("/api/session", { method: "POST", body: { role: "guest" } });
/** Driver (with its tanker) or ops, with the access code P1 sets on the server. */
export const startStaffSession = (role: "driver" | "ops", code: string, tankerId?: number) =>
  api<SessionInfo>("/api/session", { method: "POST", body: { role, code, tanker_id: tankerId } });
export const endSession = () => api<{ ok: true }>("/api/session", { method: "DELETE" });

/** Reuse this browser's session (any role) or start a guest one. */
export async function ensureGuestSession(): Promise<SessionInfo> {
  const s = await getSession();
  return s.role ? s : startGuestSession();
}

// ---------- V5 places: every locality and named street of Mauritius (OSM) ----------
// public/places.json and data/localities.csv come from scripts/fetch-osm.ts (run once, not at runtime).

/** One search entry. A locality has l === n; a street has l = its nearest locality. */
export type Place = { n: string; l: string; d: string; lat: number; lng: number };
export type Locality = { name: string; kind: string; district: string; lat: number; lng: number; source: string };

/** Pure: lower case, no accents, no apostrophes, punctuation as spaces. "L’Escalier" -> "lescalier", "Rose-Belle" -> "rose belle". */
export function foldName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’‘`´]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const foldCache = new WeakMap<Place[], { full: string; compact: string }[]>();

/**
 * Pure: best matches first. Exact name > name starts with the query > a word starts with it >
 * contains it (spaces ignored, so "rosebelle" finds "Rose Belle"). Localities before streets on a tie.
 */
export function searchPlaces(index: Place[], query: string, limit = 8): Place[] {
  const q = foldName(query), qc = q.replace(/ /g, "");
  if (!qc) return [];
  let folded = foldCache.get(index);
  if (!folded) {
    folded = index.map((p) => { const full = foldName(p.n); return { full, compact: full.replace(/ /g, "") }; });
    foldCache.set(index, folded);
  }
  const hits: { p: Place; rank: number }[] = [];
  index.forEach((p, i) => {
    const { full, compact } = folded[i];
    const rank = compact === qc ? 0 : full.startsWith(q) || compact.startsWith(qc) ? 1 : (" " + full).includes(" " + q) ? 2 : compact.includes(qc) ? 3 : -1;
    if (rank >= 0) hits.push({ p, rank: rank * 2 + (p.l === p.n ? 0 : 1) });
  });
  return hits
    .sort((a, b) => a.rank - b.rank || a.p.n.length - b.p.n.length || a.p.n.localeCompare(b.p.n))
    .slice(0, limit)
    .map((h) => h.p);
}

/** "Street, Locality" for a street, "Locality, District" for a locality. */
export const placeLabel = (p: Place) => (p.l === p.n ? `${p.n}, ${p.d}` : `${p.n}, ${p.l}`);

let placesPromise: Promise<Place[]> | null = null;
/** Browser: the island-wide search index (public/places.json, ~0.5 MB, fetched once). */
export function loadPlaces(): Promise<Place[]> {
  placesPromise ??= fetch("/places.json").then((r) => {
    if (!r.ok) throw new Error(`places.json: HTTP ${r.status}`);
    return r.json() as Promise<Place[]>;
  }).catch((e) => { placesPromise = null; throw e; });
  return placesPromise;
}

/** Localities table (needs sql/v5.sql + load-data), optionally one district. */
export async function getLocalities(district?: string): Promise<Locality[]> {
  let q = supabase.from("localities").select("name,kind,district,lat,lng,source").order("name");
  if (district) q = q.eq("district", district);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Locality[];
}

// ---------- V5 rivers: "near a river?" (computed on the phone, never sent or stored) ----------

export type RiverFeature = { properties: { name: string | null; waterway: string }; geometry: { coordinates: [number, number][] } }; // [lng, lat]
export type Rivers = { features: RiverFeature[] };
export const NEAR_RIVER_M = 200;
const EARTH_M_PER_DEG = 111_320;

/**
 * Pure: the nearest river or stream to (lat, lng) and its distance in metres. Flat projection
 * around the point (error well under 1 % at island scale). null when there are no rivers.
 */
export function nearestRiver(lat: number, lng: number, rivers: Rivers): { distance_m: number; name: string | null; waterway: string } | null {
  const kx = EARTH_M_PER_DEG * Math.cos((lat * Math.PI) / 180), ky = EARTH_M_PER_DEG;
  let best: { distance_m: number; name: string | null; waterway: string } | null = null;
  for (const f of rivers.features) {
    const pts = f.geometry.coordinates;
    for (let i = 0; i < pts.length; i++) {
      const ax = (pts[i][0] - lng) * kx, ay = (pts[i][1] - lat) * ky;
      let d = Math.hypot(ax, ay);
      if (i + 1 < pts.length) {
        const bx = (pts[i + 1][0] - lng) * kx, by = (pts[i + 1][1] - lat) * ky;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        d = Math.min(d, Math.hypot(ax + t * dx, ay + t * dy));
      }
      if (!best || d < best.distance_m) best = { distance_m: d, name: f.properties.name, waterway: f.properties.waterway };
    }
  }
  return best && { ...best, distance_m: Math.round(best.distance_m) };
}

/** Pure: metres to the nearest river or stream, or null when there are none. */
export const distanceToRiverM = (lat: number, lng: number, rivers: Rivers): number | null => nearestRiver(lat, lng, rivers)?.distance_m ?? null;

/** Browser: public/rivers.geojson (fetched on demand by the map layer / "near a river?"). */
export const loadRivers = (): Promise<Rivers> =>
  fetch("/rivers.geojson").then((r) => {
    if (!r.ok) throw new Error(`rivers.geojson: HTTP ${r.status}`);
    return r.json() as Promise<Rivers>;
  });

// ---------- V5 notices feed + AI notice parser ----------
// Notices come from scripts/scrape-notices.ts (CWA site, news RSS) and from ops pasting text
// (Facebook posts are pasted, never scraped). The parser reads localities, times, dates and kind;
// every result goes through validateParsedNotice before it is shown or stored.

export type FeedKind = "interruption" | "rationing" | "advisory" | "other";
export const FEED_KINDS: FeedKind[] = ["interruption", "rationing", "advisory", "other"];
/** Parser output after validation. Times "HH:MM" (24 h), dates "YYYY-MM-DD"; unknown = null / []. */
export type ParsedNotice = {
  localities: string[];           // matched to the localities list (canonical spelling)
  unmatched_localities: string[]; // named in the notice, not in our list: shown, never placed on a guessed locality
  start: string | null; end: string | null;
  dates: string[];
  kind: FeedKind;
  summary: string;
};
/** One row of the notices feed (table notices, V5 columns). */
export type FeedNotice = {
  id: number | null; url: string | null; published_on: string | null; source: string;
  localities: string[]; start_time: string | null; end_time: string | null; dates: string[];
  kind: FeedKind; summary: string; ai_extracted: boolean; demo: boolean;
};
export const AI_NOTICE_LABEL = "AI-read from the notice. Check the source.";

const MONTHS: Record<string, number> = {
  janvier: 1, january: 1, fevrier: 2, february: 2, mars: 3, march: 3, avril: 4, april: 4, mai: 5, may: 5, juin: 6, june: 6,
  juillet: 7, july: 7, aout: 8, august: 8, septembre: 9, september: 9, octobre: 10, october: 10, novembre: 11, november: 11, decembre: 12, december: 12,
};
const realDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
};
/** "3:00" / "03h00" / "3h" -> "03:00"; anything else (or 24:00+) -> null. */
function normTime(v: unknown): string | null {
  const m = typeof v === "string" ? /^\s*(\d{1,2})\s*[:hH]\s*(\d{2})?\s*$/.exec(v) : null;
  if (!m || +m[1] > 23 || +(m[2] ?? 0) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
}

/**
 * Pure: checks a parser result (AI JSON or the rule fallback). Localities are matched to `known`
 * by folded name; bad times / impossible dates are dropped, never repaired by guessing.
 */
export function validateParsedNotice(raw: unknown, known: string[]): Valid<ParsedNotice> {
  const b = obj(raw);
  if (!b) return { ok: false, error: "invalid_notice" };
  if (!FEED_KINDS.includes(b.kind as FeedKind)) return { ok: false, error: "invalid_kind" };
  if (!Array.isArray(b.localities) || b.localities.length > 200 || !b.localities.every((l) => typeof l === "string")) return { ok: false, error: "invalid_localities" };
  if (!Array.isArray(b.dates)) return { ok: false, error: "invalid_dates" };
  const summary = typeof b.summary === "string" ? b.summary.replace(/\s+/g, " ").trim().slice(0, 280) : "";
  if (!summary) return { ok: false, error: "invalid_summary" };
  const byFold = new Map(known.map((k) => [foldName(k), k]));
  const localities: string[] = [], unmatched: string[] = [];
  for (const l of b.localities as string[]) {
    const hit = byFold.get(foldName(l));
    if (hit) { if (!localities.includes(hit)) localities.push(hit); }
    else if (l.trim() && !unmatched.includes(l.trim())) unmatched.push(l.trim());
  }
  const dates = [...new Set((b.dates as unknown[]).flatMap((d) => {
    const m = typeof d === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
    const day = m && realDay(+m[1], +m[2], +m[3]);
    return day ? [day] : [];
  }))].sort();
  return { ok: true, value: { localities, unmatched_localities: unmatched, start: normTime(b.start), end: normTime(b.end), dates, kind: b.kind as FeedKind, summary } };
}

/**
 * Pure rule-based reader, used when the AI is not configured or fails (ai_extracted = false).
 * Localities: known names found as whole words. Times: the first two "3h" / "05:00" style times.
 * Dates: dd/mm/yyyy or "12 octobre 2026". Kind from keywords. Summary: the first sentence.
 */
export function extractNoticeRules(text: string, known: string[]): ParsedNotice {
  const ft = ` ${foldName(text)} `;
  const localities = known.filter((k) => { const f = foldName(k); return f.length >= 4 && ft.includes(` ${f} `); });
  const times = [...text.matchAll(/(?<![\d/])(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?(?!\d)/g)].map((m) => normTime(`${m[1]}:${m[2] ?? "00"}`)).filter((t): t is string => !!t);
  const dates: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) dates.push(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  for (const m of foldName(text).matchAll(/\b(\d{1,2}) ([a-z]+) (\d{4})\b/g)) {
    const mo = MONTHS[m[2]];
    if (mo) dates.push(`${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  const kind: FeedKind = /coupure|interruption|suspension|travaux|repair|panne/.test(ft) ? "interruption"
    : /bouillir|boil|qualite|quality|turbid|trouble/.test(ft) ? "advisory"
    : /horaire|distribution|un jour sur deux|every second day|rationn|approvisionnement|supply/.test(ft) ? "rationing" : "other";
  const summary = (text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "").slice(0, 200) || "Water notice";
  const v = validateParsedNotice({ localities, start: times[0] ?? null, end: times[1] ?? null, dates, kind, summary }, known);
  return v.ok ? v.value : { localities, unmatched_localities: [], start: null, end: null, dates: [], kind, summary };
}

/** Notices feed, newest first; `locality` keeps notices naming it plus island-wide ones (no locality). */
export const getNoticeFeed = (locality?: string) =>
  api<{ notices: FeedNotice[]; demo: boolean }>(`/api/notices/feed${locality ? `?locality=${encodeURIComponent(locality)}` : ""}`);

/** Ops: read a pasted notice (AI, cached). save = true stores it in the feed. */
export const parseNotice = (text: string, url?: string, save = false) =>
  api<{ notice: ParsedNotice; ai_extracted: boolean; cached: boolean; saved_id: number | null; note: string | null }>("/api/notices/parse", {
    method: "POST", body: { text, url, save },
  });

// ---------- V5 accounts: Supabase Auth, email + password ----------
// Guests report and request; a complaint needs sign-in. No profile, no name. The email is shown
// only to its owner. Errors are ApiError with Supabase's code, e.g. "invalid_credentials",
// "user_already_exists", "weak_password", "email_address_invalid", "over_request_rate_limit".

export type User = { id: string; email: string | null };
export const MIN_PASSWORD = 6; // Supabase default

/** Pure: same checks the form shows before calling Supabase. */
export function validateCredentials(email: string, password: string): Valid<{ email: string; password: string }> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "email_address_invalid" };
  if (password.length < MIN_PASSWORD) return { ok: false, error: "weak_password" };
  return { ok: true, value: { email: e, password } };
}

function authFail(e: { status?: number; code?: string; message?: string }): never {
  throw new ApiError(e.status ?? 400, e.code ?? "auth_error", { message: e.message });
}
const toUser = (u: { id: string; email?: string | null } | null | undefined): User | null => (u ? { id: u.id, email: u.email ?? null } : null);

/**
 * Creates the account and signs in. Returns null when Supabase still wants the email confirmed
 * (P1 turns "Confirm email" off for the demo, so this should not happen).
 */
export async function signUp(email: string, password: string): Promise<User | null> {
  const v = validateCredentials(email, password);
  if (!v.ok) throw new ApiError(400, v.error);
  const { data, error } = await supabase.auth.signUp(v.value);
  if (error) authFail(error);
  // An existing email comes back as a user with no identities and no error (Supabase hides who exists).
  if (data.user && data.user.identities?.length === 0) throw new ApiError(400, "user_already_exists");
  return data.session ? toUser(data.user) : null;
}

export async function signIn(email: string, password: string): Promise<User> {
  const v = validateCredentials(email, password);
  if (!v.ok) throw new ApiError(400, v.error === "weak_password" ? "invalid_credentials" : v.error);
  const { data, error } = await supabase.auth.signInWithPassword(v.value);
  if (error) authFail(error);
  return toUser(data.user)!;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) authFail(error);
}

/** The signed-in user from this browser's stored session, or null for a guest. No network call. */
export async function getUser(): Promise<User | null> {
  return toUser((await supabase.auth.getSession()).data.session?.user);
}

/** Calls `cb` now and on every sign-in / sign-out. Returns the unsubscribe function (nav "Signed in" + Log out). */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)));
  return () => data.subscription.unsubscribe();
}

// ---------- fetch helper for /api/* ----------

export class ApiError extends Error {
  constructor(public status: number, public code: string, public detail: Record<string, unknown> = {}) {
    super(`${status} ${code}`);
  }
}

/** auth: true sends the Supabase access token; without a signed-in user it throws sign_in_required. */
async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.auth) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) throw new ApiError(401, "sign_in_required");
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof data.error === "string" ? data.error : `http_${res.status}`, data);
  return data as T;
}

/** The API is not usable here yet (no route, no service key, v3.sql not run): use the legacy anon path. */
function apiNotDeployed(e: unknown): boolean {
  return e instanceof ApiError && (e.code === "http_404" || e.code === "backend_not_configured" || e.code === "migration_missing");
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

  // ===== V3 =====
  let fails = 0;
  const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.error("FAIL", msg); } };

  // Capacity: loads
  ok(loadsNeeded(0, 100) === 0, "0 L -> 0 loads");
  ok(loadsNeeded(100, 100) === 1, "100 L -> 1 load");
  ok(loadsNeeded(120, 100) === 2, "120 L -> 2 loads");
  for (const bad of [0, -5, NaN]) {
    let threw = false;
    try { loadsNeeded(10, bad); } catch { threw = true; }
    ok(threw, `capacity ${bad} rejected`);
  }
  // The brief's example: six places x 20 L, tank of 100 L.
  const six = [1, 2, 3, 4, 5, 6].map((i) => ({ request_id: i, street_id: i, order_index: i, litres: 20 }));
  const oneTanker = planDispatch(six, { capacityLitres: 100, tankers: 1 });
  ok(oneTanker.loads_needed === 2 && oneTanker.tankers_for_one_departure === 2, "120 L / 100 L: 2 loads, 2 tankers for one departure");
  ok(oneTanker.assigned_litres === 100 && oneTanker.unmet_litres === 20 && oneTanker.refill_trips_needed === 1 && !oneTanker.feasible, "1 tanker, 1 trip: 20 L unmet, 1 refill trip needed");
  const twoTrips = planDispatch(six, { capacityLitres: 100, tankers: 1, maxTripsPerTanker: 2 });
  ok(twoTrips.feasible && twoTrips.loads[1].tanker_no === 1 && twoTrips.loads[1].trip_no === 2, "1 tanker doing 2 trips covers it");
  const twoTankers = planDispatch(six, { capacityLitres: 100, tankers: 2 });
  ok(twoTankers.feasible && twoTankers.refill_trips_needed === 0 && twoTankers.loads[1].tanker_no === 2, "2 tankers, no refill");
  ok(oneTanker.loads[0].litres === 100 && oneTanker.loads[0].stops.length === 5 && oneTanker.loads[1].stops[0].street_id === 6, "street order: first 5 streets on load 1");
  const none = planDispatch([], { capacityLitres: 100, tankers: 2 });
  ok(none.loads_needed === 0 && none.feasible && none.unmet_litres === 0, "no demand -> no loads");
  const noFleet = planDispatch(six, { capacityLitres: 100, tankers: 0 });
  ok(noFleet.assigned_litres === 0 && noFleet.unmet_litres === 120, "no tanker available -> all unmet");
  // Split vs no split with a 150 L request
  const big = [{ request_id: 7, street_id: 1, order_index: 1, litres: 150 }, { request_id: 8, street_id: 2, order_index: 2, litres: 30 }];
  const sp = planDispatch(big, { capacityLitres: 100, tankers: 2 });
  ok(sp.loads.length === 2 && sp.loads[0].stops[0].requests[0].litres === 100 && sp.loads[1].litres === 80, "split: 150 L as 100 + 50 (+30)");
  const ns = planDispatch(big, { capacityLitres: 100, tankers: 2, split: false });
  ok(ns.infeasible.length === 1 && ns.infeasible[0].request_id === 7 && ns.unmet_litres === 150 && ns.loads.length === 1, "no split: 150 L infeasible, never overfilled");
  ok(sp.loads.every((l) => l.litres <= 100) && ns.loads.every((l) => l.litres <= 100), "no load above capacity");

  // Validation
  ok(validateRequestInput({ street_id: 1 }).ok, "valid request");
  const withLitres = validateRequestInput({ street_id: 1, litres: 5000 });
  ok(withLitres.ok && !("litres" in withLitres.value), "V5: litres from a resident are ignored, not stored");
  ok(!validateRequestInput({ street_id: "1" }).ok && !validateRequestInput(null).ok, "bad street id rejected");
  // V5 places: accent / apostrophe tolerant search
  ok(foldName("L’Escalier") === "lescalier" && foldName("L'Escalier") === "lescalier" && foldName("Rose-Belle") === "rose belle", "foldName");
  const idx: Place[] = [
    { n: "L’Escalier", l: "L’Escalier", d: "Grand Port", lat: -20.47, lng: 57.62 },
    { n: "Chemin Chamarel", l: "Case Noyale", d: "Black River", lat: -20.4, lng: 57.38 },
    { n: "Chamarel", l: "Chamarel", d: "Black River", lat: -20.42, lng: 57.39 },
    { n: "Rose Belle", l: "Rose Belle", d: "Grand Port", lat: -20.4, lng: 57.6 },
    { n: "Royal Road", l: "Rose Belle", d: "Grand Port", lat: -20.41, lng: 57.6 },
  ];
  ok(searchPlaces(idx, "lescalier")[0]?.n === "L’Escalier" && searchPlaces(idx, "l'escalier")[0]?.n === "L’Escalier", "lescalier finds L’Escalier");
  ok(searchPlaces(idx, "rose-belle")[0]?.n === "Rose Belle" && searchPlaces(idx, "rosebelle")[0]?.n === "Rose Belle", "Rose-Belle / rosebelle find Rose Belle");
  const cham = searchPlaces(idx, "chamarel");
  ok(cham[0]?.n === "Chamarel" && cham[1]?.n === "Chemin Chamarel", "locality before the street that contains its name");
  ok(searchPlaces(idx, "  ").length === 0 && searchPlaces(idx, "zzz").length === 0, "empty / no match -> []");
  ok(placeLabel(idx[4]) === "Royal Road, Rose Belle" && placeLabel(idx[2]) === "Chamarel, Black River", "labels");
  // V5 rivers: a 2 km east-west river at lat -20.30
  const riv: Rivers = { features: [{ properties: { name: "Rivière Test", waterway: "river" }, geometry: { coordinates: [[57.50, -20.30], [57.52, -20.30]] } }] };
  const south = nearestRiver(-20.301, 57.51, riv);
  ok(south !== null && Math.abs(south.distance_m - 111) <= 1 && south.name === "Rivière Test", "111 m south of the river");
  ok(Math.abs((distanceToRiverM(-20.30, 57.53, riv) ?? 0) - 1044) <= 5, "past the end: distance to the end point");
  ok(distanceToRiverM(-20.30, 57.51, riv) === 0 && distanceToRiverM(-20.3, 57.5, { features: [] }) === null, "on the river = 0; no rivers = null");
  // V5 notice parser: validation + rule fallback
  const known = ["Vacoas", "Phoenix", "Curepipe", "Forest Side", "Floréal", "L’Escalier", "Mon Trésor"];
  const pv = validateParsedNotice({ localities: ["vacoas", "FLOREAL", "Atlantis"], start: "3h", end: "08:00", dates: ["2026-10-12", "2026-02-30", "x"], kind: "rationing", summary: "  New  hours. " }, known);
  ok(pv.ok && pv.value.localities.join() === "Vacoas,Floréal" && pv.value.unmatched_localities.join() === "Atlantis", "localities matched by folded name, unknown kept apart");
  ok(pv.ok && pv.value.start === "03:00" && pv.value.end === "08:00" && pv.value.dates.join() === "2026-10-12" && pv.value.summary === "New hours.", "times normalised, impossible dates dropped");
  ok(!validateParsedNotice({ localities: [], start: null, end: null, dates: [], kind: "safe", summary: "x" }, known).ok, "unknown kind rejected");
  ok(!validateParsedNotice({ localities: [], start: null, end: null, dates: [], kind: "other", summary: " " }, known).ok, "empty summary rejected");
  const bad = validateParsedNotice({ localities: [], start: "25:00", end: "noon", dates: [], kind: "other", summary: "s" }, known);
  ok(bad.ok && bad.value.start === null && bad.value.end === null, "bad times become null, never guessed");
  const ruleNotice = extractNoticeRules("Nouveaux horaires de distribution d'eau pour Vacoas, Phoenix et Forest-Side: de 3h à 8h, un jour sur deux, à partir du 12 octobre 2026.", known);
  ok(ruleNotice.localities.join() === "Vacoas,Phoenix,Forest Side" && ruleNotice.start === "03:00" && ruleNotice.end === "08:00", "rules: localities + times");
  ok(ruleNotice.dates.join() === "2026-10-12" && ruleNotice.kind === "rationing", "rules: French date + kind");
  const cut = extractNoticeRules("Coupure d'eau le 14/11/2026 de 09:00 à 15:30 à L'Escalier et Mon Trésor.", known);
  ok(cut.kind === "interruption" && cut.dates.join() === "2026-11-14" && cut.end === "15:30" && cut.localities.join() === "L’Escalier,Mon Trésor", "rules: interruption, dd/mm/yyyy, apostrophes");
  // V5 accounts: form checks before Supabase
  const cred = validateCredentials("  Ana@Example.MU ", "secret1");
  ok(cred.ok && cred.value.email === "ana@example.mu", "email trimmed + lower-cased");
  ok(!validateCredentials("ana@", "secret1").ok && !validateCredentials("ana example.mu", "secret1").ok, "bad email rejected");
  const short = validateCredentials("ana@example.mu", "12345");
  ok(!short.ok && short.error === "weak_password", "password under 6 characters rejected");
  ok(validateReportInput({ street_id: 3, type: "water_off" }).ok && !validateReportInput({ street_id: 3, type: "maybe" }).ok, "report type checked");
  ok(validateComplaintInput({ street_id: 3, category: "dirty_water" }).ok && !validateComplaintInput({ street_id: 3, category: "rude" }).ok, "complaint category checked");
  ok(validatePositionInput({ round_id: 1, lat: -20.3, lng: 57.5 }).ok && !validatePositionInput({ round_id: 1, lat: 91, lng: 0 }).ok, "position range checked");

  // Trust: independence by session
  const tr = (type: ReportType, source: string | null, min: number) => ({ type, source, created_at: new Date(Date.UTC(2026, 10, 13, 10, min)).toISOString() });
  const lone = computeStreetTrust(1, [tr(on, "s1", 0)], null, null);
  ok(lone.trust === "unconfirmed" && lone.confidence === "low" && lone.reasons.includes("single_source"), "one report stays unconfirmed");
  const spam = computeStreetTrust(1, [tr(off, "s1", 0), tr(off, "s1", 10), tr(off, "s1", 20)], null, null);
  ok(spam.trust === "unconfirmed" && spam.independent_sources === 1 && spam.reasons.includes("duplicate_source"), "repeats from one session do not corroborate");
  const two = computeStreetTrust(1, [tr(off, "s1", 0), tr(off, "s2", 10)], null, null);
  ok(two.trust === "confirmed" && two.confidence === "medium", "two sessions agree -> confirmed");
  const three = computeStreetTrust(1, [tr(off, "s1", 0), tr(off, "s2", 10), tr(off, "s3", 20)], null, null);
  ok(three.confidence === "high" && !three.needs_review, "three sessions agree -> high");
  const conflict = computeStreetTrust(1, [tr(on, "s1", 0), tr(off, "s2", 10)], null, null);
  ok(conflict.trust === "unconfirmed" && conflict.reasons.includes("conflicting_reports") && conflict.needs_review, "conflict stays reviewable");
  const burst = computeStreetTrust(1, [tr(off, "a", 0), tr(off, "b", 1), tr(off, "c", 2), tr(off, "d", 3)], null, null);
  ok(burst.reasons.includes("burst") && burst.confidence === "medium" && burst.needs_review, "burst capped at medium + review");
  const nb = computeStreetTrust(1, [tr(on, "s1", 0)], [off], [off]);
  ok(nb.suspect && nb.reasons.includes("neighbours_disagree") && nb.trust === "unconfirmed", "neighbours are context: review, not fake");
  const all = computeAllStreetTrust([{ id: 1, order_index: 1 }, { id: 2, order_index: 2 }, { id: 3, order_index: 3 }], [
    { street_id: 1, type: off, created_at: tr(off, null, 0).created_at, source: "x" },
    { street_id: 2, type: on, created_at: tr(on, null, 1).created_at, source: "y" },
    { street_id: 3, type: off, created_at: tr(off, null, 2).created_at, source: "z" },
  ]);
  ok(all[2].suspect && !all[1].suspect && !all[3].suspect, "computeAllStreetTrust uses neighbours in route order");

  // Priority explanation
  const unknown = explainPriority(null, 1);
  ok(!unknown.dry_known && unknown.score === 12 && unknown.reasons.some((r) => r.includes("dryness unknown")) && unknown.reasons[0] === "1 household waiting for a tanker", "unknown dryness is said, not shown as 0 h");
  const rows = priorityRows([{ id: 1, name: "A" }, { id: 2, name: "B" }], { 1: 10, 2: null }, [{ street_id: 2 }, { street_id: 2 }]);
  ok(rows[0].street_id === 2 && rows[0].waiting === 2 && rows[0].hours_dry === null && !rows[0].reasons.join().includes(" L"), "priority rows: households, no litres, unknown kept null");

  // Complaints grouped
  const cs: Complaint[] = [
    { id: 1, street_id: 1, category: "no_water", created_at: "2026-11-13T08:00:00Z", status: "open" },
    { id: 2, street_id: 2, category: "no_water", created_at: "2026-11-13T09:00:00Z", status: "open" },
    { id: 3, street_id: 9, category: "dirty_water", created_at: "2026-11-13T07:00:00Z", status: "open" },
  ];
  const gs = groupComplaints(cs, { 1: 10, 2: 10 });
  ok(gs[0].count === 2 && gs[0].ids.join() === "1,2" && gs[0].area_id === 10 && gs[1].area_id === null, "complaints grouped by category + area, ids kept");

  // Reservoirs: latest per reservoir, stale, missing, aggregate apart
  const rl = latestReservoirs([
    { reservoir: "Mare aux Vacoas", day: "2026-11-05", level_pct: 33, source_url: "u", date_basis: "article_date", is_aggregate: false },
    { reservoir: "Mare aux Vacoas", day: "2026-10-08", level_pct: 35.7, source_url: "u", date_basis: "data_date", is_aggregate: false },
    { reservoir: "La Ferme", day: "2026-07-06", level_pct: 46.8, source_url: "u", date_basis: "data_date", is_aggregate: false },
    { reservoir: "ALL_7_RESERVOIRS", day: "2026-10-09", level_pct: 56.8, source_url: "u", date_basis: "data_date", is_aggregate: true },
  ], now);
  const mav = rl.reservoirs.find((r) => r.reservoir === "Mare aux Vacoas");
  ok(mav?.state === "current" && "level_pct" in mav && mav.level_pct === 33 && mav.tier === "watch", "latest MaV reading is current");
  ok(rl.reservoirs.find((r) => r.reservoir === "La Ferme")?.state === "stale", "July reading is stale");
  ok(rl.reservoirs.find((r) => r.reservoir === "Midlands Dam")?.state === "missing", "no reading -> missing, still listed");
  ok(rl.aggregate !== null && !rl.reservoirs.some((r) => r.reservoir === "ALL_7_RESERVOIRS"), "aggregate kept apart");

  // Notices
  const nt = (id: number, kind: NoticeKind, starts: string | null, ends: string | null, source_date: string): Notice =>
    ({ id, kind, topic: null, locality: "Vacoas", area_id: 1, starts_at: starts, ends_at: ends, title: "t", source_url: "u", source_date });
  const cl = classifyNotices([
    nt(1, "interruption", "2026-11-13T08:00:00", "2026-11-13T18:00:00", "2026-11-12"),
    nt(2, "interruption", "2026-11-14T08:00:00", "2026-11-14T18:00:00", "2026-11-12"),
    nt(3, "interruption", "2025-10-13T09:00:00", "2025-10-13T22:00:00", "2025-10-11"),
    nt(4, "rationing", null, null, "2026-11-01"),
  ], now);
  ok(cl.active.map((n) => n.id).join() === "1,4" && cl.upcoming[0].id === 2 && cl.expired_count === 1, "notices: active / upcoming / expired");
  ok(cl.active.find((n) => n.id === 4)!.open_ended && cl.advisory_message === NO_ADVISORY_TEXT, "open-ended flagged; no advisory -> honest message");

  // Locality matching
  const areas = [{ id: 1, name: "Vacoas" }, { id: 2, name: "Pointe-aux-Piments" }];
  ok(matchArea(" vacoas ", areas) === 1 && matchArea("Pointe aux Piments", areas) === 2 && matchArea("Triolet", areas) === null, "locality match, unmatched stays null");

  // ===== V4 water day =====
  // op 24 forecast. now = Fri 13 Nov 2026 12:00.
  const alt = (from: string, to: string) => {
    const out: ScheduleRow[] = [];
    for (let d = parseDay(from); d <= parseDay(to); d = addDays(d, 2)) out.push({ day: isoDate(d), start_time: "03:00:00", end_time: "08:00:00", source_url: "cwa", source_date: "2026-10-10" });
    return out;
  };
  const offl = computeForecast(alt("2026-10-10", "2026-11-29"), "watch", null, now);
  ok(offl?.basis === "official" && offl.confidence === "high" && offl.next.day === "2026-11-15" && offl.next.start_time === "03:00", "official window on or after tomorrow wins");
  const wk = computeForecast([{ day: "Mon", start_time: "05:00", end_time: "09:00", source_url: null, source_date: null }], null, null, now);
  ok(wk?.basis === "official" && wk.next.day === "2026-11-16", "weekday row -> next Monday");
  const rule = computeForecast(alt("2026-10-10", "2026-11-11"), "watch", null, now);
  ok(rule?.basis === "every_second_day" && rule.confidence === "medium" && rule.next.day === "2026-11-15" && rule.note.includes("10 Oct") && rule.note.includes("watch"), "rule: 11 Nov + 2 = today, so 15 Nov");
  const skip = computeForecast(alt("2026-10-10", "2026-11-01"), "critical", null, now);
  ok(skip?.next.day === "2026-11-15" && skip.confidence === "low" && skip.note.includes("cuts may get longer"), "rule skips forward on the 2-day grid; critical -> low");
  const notAlt = [{ day: "2026-11-01", start_time: "03:00", end_time: "08:00", source_url: null, source_date: null }, { day: "2026-11-02", start_time: "03:00", end_time: "08:00", source_url: null, source_date: null }, { day: "2026-11-05", start_time: "03:00", end_time: "08:00", source_url: null, source_date: null }];
  const hist = computeForecast(notAlt, null, { from: "06:00", to: "08:00", days_hit: 4, days_total: 6 }, now);
  ok(hist?.basis === "history" && hist.confidence === "low" && hist.next.day === "2026-11-14" && hist.source_url === null, "no rule -> history, low");
  ok(computeForecast(notAlt, null, null, now) === null, "nothing to go on -> null");

  // op 25 trend: the 7 real Mare aux Vacoas readings in data/reservoir.csv.
  const mavRows: TrendPoint[] = [
    { day: "2026-09-25", level_pct: 38.5 }, { day: "2026-09-28", level_pct: 37.3 }, { day: "2026-10-02", level_pct: 36.6 },
    { day: "2026-10-16", level_pct: 34.6 }, { day: "2026-10-19", level_pct: 34.2 }, { day: "2026-10-30", level_pct: 33.8 }, { day: "2026-11-05", level_pct: 33 },
  ];
  const mavT = reservoirTrend(mavRows, now, "Mare aux Vacoas")!;
  ok(mavT.pct_per_day < -0.1 && mavT.pct_per_day > -0.15, `MaV slope about -0.12 %/day (got ${mavT.pct_per_day})`);
  ok(mavT.days_to_30 !== null && mavT.days_to_20 !== null && mavT.days_to_20 > mavT.days_to_30, "falling -> days to 30% then 20%");
  ok(!!mavT.reaches_20_on && mavT.reaches_20_on.startsWith("2027-02"), `MaV reaches 20% in Feb 2027 (got ${mavT.reaches_20_on})`);
  ok(mavT.projection.length === 31 && mavT.projection[0].day === "2026-11-13" && mavT.projection[30].level_pct < mavT.projection[0].level_pct, "30-day projection falls");
  ok(mavT.latest_pct === 33 && mavT.latest_day === "2026-11-05" && mavT.points.length === 7, "latest reading");
  const rising = reservoirTrend([{ day: "2026-10-01", level_pct: 30 }, { day: "2026-10-10", level_pct: 32 }, { day: "2026-10-20", level_pct: 35 }], now)!;
  ok(rising.pct_per_day > 0 && rising.days_to_30 === null && rising.days_to_20 === null, "rising -> null days");
  const twoP = reservoirTrend([{ day: "2026-10-01", level_pct: 40 }, { day: "2026-10-10", level_pct: 35 }], now)!;
  ok(twoP.days_to_20 === null && twoP.pct_per_day < 0, "fewer than 3 points -> null days");
  ok(reservoirTrend([], now) === null, "no readings -> null");
  const below = reservoirTrend([{ day: "2026-10-01", level_pct: 29.5 }, { day: "2026-10-10", level_pct: 29.3 }, { day: "2026-10-20", level_pct: 29.1 }], now)!;
  ok(below.days_to_30 === 0 && below.days_to_20 !== null && below.days_to_20 > 0, "already under 30% -> 0 days, 20% still ahead");

  // op 26 quality
  const boilN: QualityNotice = { title: "Boil water notice", day: "2026-11-12", category: "boil", source_url: "https://cwa" };
  const qN: QualityNotice = { title: "Turbidity", day: "2026-11-12", category: "quality", source_url: "https://cwa" };
  ok(computeWaterQuality([qN, boilN], "normal", now).message === QUALITY_MESSAGES.boil, "boil notice wins, even at normal level");
  ok(computeWaterQuality([{ ...boilN, day: "2026-10-01" }], "watch", now).level === "cloudy_possible", "old notice expired -> low tier caution");
  ok(computeWaterQuality([], "critical", now).level === "cloudy_possible" && computeWaterQuality([], "normal", now).level === "none" && computeWaterQuality([], null, now).level === "none", "tier rule");
  ok(Object.values(QUALITY_MESSAGES).every((m) => !/\bsafe\b|\bunsafe\b|\bdrinkable\b/i.test(m)), "no message claims safe / unsafe water");

  // op 27 planner
  const plan = planDay({ start_time: "03:00", end_time: "08:00" });
  ok(plan[0].kind === "remind" && plan[0].time === "02:30" && plan[0].offset === -30, "reminder = start - 30 min (offset -30)");
  ok(plan.map((p) => p.offset).join() === "-30,0,0,180,270,300", "offsets in minutes from the window start");
  ok(planDay({ start_time: "23:00", end_time: "02:00" }).at(-1)?.offset === 180, "offset counts across midnight");
  ok(districtOf("Vacoas") === "Plaines-Wilhems" && districtOf("Triolet") === null, "district map; unknown stays null");
  ok(plan.map((p) => p.time).join() === "02:30,03:00,03:00,06:00,07:30,08:00" && plan[1].kind === "arrive" && plan[5].kind === "end", "03:00-08:00 plan");
  const night = planDay({ start_time: "23:00:00", end_time: "02:00:00" });
  ok(night[0].time === "22:30" && night[night.length - 1].time === "02:00" && !night.some((p) => p.label === "Washing machine"), "3 h window over midnight; no room for the machine");
  ok(planDay({ start_time: "22:00", end_time: "02:00" }).some((p) => p.label === "Washing machine" && p.time === "01:00"), "4 h window over midnight fits the machine at 01:00");
  ok(planDay({ start_time: "00:15", end_time: "04:00" })[0].time === "23:45", "reminder before midnight");
  const custom = planDay({ start_time: "03:00", end_time: "08:00" }, ["Fill buckets", "Shower", "Dishes"]);
  ok(custom.filter((p) => p.kind === "task").map((p) => p.time).join() === "03:00,05:15,07:30", "custom tasks spread to end - 30 min");

  // Mauritius clock: 22:30 UTC is 02:30 the next day in Mauritius.
  const mu = mauritiusNow(new Date(Date.UTC(2026, 10, 13, 22, 30)));
  ok(mu.getDate() === 14 && mu.getHours() === 2 && mu.getMinutes() === 30, "mauritiusNow");

  if (fails) { console.error(`${fails} V3 check(s) failed`); process.exit(1); }
  console.log("queries ok");
}

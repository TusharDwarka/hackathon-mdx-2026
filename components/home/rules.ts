// V2 rules (contracts/api.md ops 12, 15, 16) as pure functions.
// LOCAL STAND-INS: P3 owns these rules in lib/queries.ts. Same shapes as the contract,
// so the swap is an import change once P3's functions are on main.
// Self-check: npx tsx components/home/rules.ts
import type { ReportType } from "@/lib/queries";

export type Report = { type: ReportType; created_at: string };

// ---------- op 12: reservoir tier (DEMO thresholds, labelled as such in the UI) ----------
export type Tier = "normal" | "watch" | "critical";
export type ReservoirStatus = { level_pct: number; day: string; tier: Tier };
export const reservoirTier = (levelPct: number): Tier => (levelPct >= 60 ? "normal" : levelPct >= 30 ? "watch" : "critical");

// ---------- op 15: street water status with trust ----------
export type StreetStatus = { state: ReportType | null; trust: "confirmed" | "unconfirmed"; total: number; agree: number };

/** Reports of the last 3 h: confirmed when there are >= 2 reports and >= 2/3 of them agree. */
export function streetStatus(reports: Report[], now: Date): StreetStatus {
  const recent = reports.filter((r) => {
    const age = now.getTime() - new Date(r.created_at).getTime();
    return age >= 0 && age <= 3 * 3600_000;
  });
  if (!recent.length) return { state: null, trust: "unconfirmed", total: 0, agree: 0 };
  const on = recent.filter((r) => r.type === "water_on").length;
  const off = recent.length - on;
  // A tie is settled by the newest report (it is unconfirmed either way).
  const newest = recent.reduce((a, b) => (a.created_at > b.created_at ? a : b));
  const state: ReportType = on === off ? newest.type : on > off ? "water_on" : "water_off";
  const agree = state === "water_on" ? on : off;
  return { state, trust: recent.length >= 2 && agree * 3 >= recent.length * 2 ? "confirmed" : "unconfirmed", total: recent.length, agree };
}

// ---------- op 16: likely water time ----------
export type LikelyTime = { from: string; to: string; days_hit: number; days_total: number };

/** From the "water_on" reports of the last 14 days: the 2-hour slot hit on the most days. null under 3 days of history. */
export function likelyWaterTime(reports: Report[], now: Date): LikelyTime | null {
  const since = now.getTime() - 14 * 24 * 3600_000;
  const hoursByDay = new Map<string, Set<number>>(); // local day -> hours with a water_on report
  for (const r of reports) {
    const d = new Date(r.created_at);
    if (r.type !== "water_on" || d.getTime() < since || d.getTime() > now.getTime()) continue;
    const day = d.toLocaleDateString("en-CA");
    if (!hoursByDay.has(day)) hoursByDay.set(day, new Set());
    hoursByDay.get(day)!.add(d.getHours());
  }
  if (hoursByDay.size < 3) return null;
  let best = { start: 0, hit: 0 };
  for (let start = 0; start <= 22; start++) {
    const hit = [...hoursByDay.values()].filter((h) => h.has(start) || h.has(start + 1)).length;
    if (hit > best.hit) best = { start, hit }; // ties: the earliest slot stays
  }
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return { from: hh(best.start), to: hh(best.start + 2), days_hit: best.hit, days_total: hoursByDay.size };
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("rules.ts")) {
  console.assert(reservoirTier(60) === "normal" && reservoirTier(59.9) === "watch" && reservoirTier(30) === "watch" && reservoirTier(29.9) === "critical", "tiers");

  const now = new Date(2026, 10, 13, 12, 0);
  const at = (daysAgo: number, h: number, m = 0) => new Date(2026, 10, 13 - daysAgo, h, m).toISOString();
  const r = (type: ReportType, daysAgo: number, h: number, m = 0): Report => ({ type, created_at: at(daysAgo, h, m) });
  console.assert(streetStatus([], now).state === null, "no reports");
  console.assert(streetStatus([r("water_off", 0, 8)], now).state === null, "older than 3 h is ignored");
  const one = streetStatus([r("water_off", 0, 11)], now);
  console.assert(one.state === "water_off" && one.trust === "unconfirmed", "one report is never confirmed");
  const two = streetStatus([r("water_off", 0, 10), r("water_off", 0, 11), r("water_on", 0, 11, 30)], now);
  console.assert(two.state === "water_off" && two.trust === "confirmed" && two.agree === 2 && two.total === 3, "2 of 3 agree");
  const split = streetStatus([r("water_off", 0, 10), r("water_on", 0, 11)], now);
  console.assert(split.state === "water_on" && split.trust === "unconfirmed", "tie: newest wins, unconfirmed");

  console.assert(likelyWaterTime([r("water_on", 1, 5), r("water_on", 2, 6)], now) === null, "under 3 days");
  const likely = likelyWaterTime([r("water_on", 1, 5, 30), r("water_on", 2, 6, 10), r("water_on", 3, 6, 50), r("water_on", 4, 14), r("water_off", 5, 6), r("water_on", 20, 6)], now);
  console.assert(likely?.from === "05:00" && likely.to === "07:00" && likely.days_hit === 3 && likely.days_total === 4, "05:00 to 07:00 on 3 of 4 days");
  console.log("rules ok");
}

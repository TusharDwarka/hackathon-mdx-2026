// Ops 15 and 16 for the resident screen: the rules are P3's pure functions in lib/queries.ts.
// This file only picks the right reports from the street's last 14 days, which the page already has.
// Self-check: npx tsx components/home/rules.ts
import { computeLikelyWaterTime, computeStreetStatus, type LikelyWaterTime, type ReportType, type StreetStatus } from "@/lib/queries";

export type Report = { type: ReportType; created_at: string };

/** Op 15 on the reports of the last 3 h. `agree` = how many of them match the status. Neighbours are not used here (ops uses them). */
export function streetStatus(streetId: number, reports: Report[], now: Date): StreetStatus & { agree: number } {
  // No lower bound on purpose: a report sent a few seconds "after" now (the page clock ticks every 30 s) still counts.
  const recent = reports.filter((r) => now.getTime() - new Date(r.created_at).getTime() <= 3 * 3600_000).map((r) => r.type);
  const s = computeStreetStatus(streetId, recent, null, null);
  return { ...s, agree: recent.filter((t) => t === s.status).length };
}

/** Op 16 on the "water_on" reports of the last 14 days. */
export function likelyWaterTime(reports: Report[], now: Date): LikelyWaterTime | null {
  const since = now.getTime() - 14 * 24 * 3600_000;
  return computeLikelyWaterTime(reports.filter((r) => r.type === "water_on").map((r) => new Date(r.created_at)).filter((d) => d.getTime() >= since));
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("rules.ts")) {
  const now = new Date(2026, 10, 13, 12, 0);
  const r = (type: ReportType, daysAgo: number, h: number, m = 0): Report => ({ type, created_at: new Date(2026, 10, 13 - daysAgo, h, m).toISOString() });
  console.assert(streetStatus(1, [], now).status === null, "no reports");
  console.assert(streetStatus(1, [r("water_off", 0, 8)], now).status === null, "older than 3 h is ignored");
  const one = streetStatus(1, [r("water_off", 0, 11)], now);
  console.assert(one.status === "water_off" && one.trust === "unconfirmed", "one report is never confirmed");
  const two = streetStatus(1, [r("water_off", 0, 10), r("water_off", 0, 11), r("water_on", 0, 11, 30)], now);
  console.assert(two.status === "water_off" && two.trust === "confirmed" && two.agree === 2 && two.reports === 3, "2 of 3 agree");
  const split = streetStatus(1, [r("water_off", 0, 10), r("water_on", 0, 11)], now);
  console.assert(split.status === "water_on" && split.trust === "unconfirmed", "tie: newest wins, unconfirmed");
  console.assert(streetStatus(1, [r("water_on", 0, 12), { type: "water_on", created_at: new Date(now.getTime() + 20_000).toISOString() }], now).reports === 2, "a report from the last seconds counts");

  console.assert(likelyWaterTime([r("water_on", 1, 5), r("water_on", 2, 6)], now) === null, "under 3 days");
  // 2-hour slots 00-02, 02-04 ...: 06:10 and 06:50 fall in 06-08 on 2 days; day 20 is older than 14 days.
  const likely = likelyWaterTime([r("water_on", 1, 5, 30), r("water_on", 2, 6, 10), r("water_on", 3, 6, 50), r("water_on", 4, 14), r("water_off", 5, 6), r("water_on", 20, 6)], now);
  console.assert(likely?.from === "06:00" && likely.to === "08:00" && likely.days_hit === 2 && likely.days_total === 4, "06:00 to 08:00 on 2 of 4 days");
  console.log("rules ok");
}

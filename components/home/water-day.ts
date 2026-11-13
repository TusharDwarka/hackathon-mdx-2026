// Water-day rules for the resident screen (docs/WATER-DAY-SPLIT.md): op 27 planDay, op 24 forecastNext,
// op 26 waterQuality, plus the calendar file for the reminder and a distance helper. Pure, no IO.
// ponytail: local stand-ins with P1's V4 shapes until P3 ships these in lib/queries.ts; then swap the import.
// Self-check: npx tsx components/home/water-day.ts
import { toMin } from "@/components/home/time";
import type { LikelyWaterTime, ReservoirTier } from "@/lib/queries";

export type Win = { start_time: string; end_time: string; source_url?: string | null };
export type PlanStep = { time: string; label: string; kind: "remind" | "arrive" | "task" | "end" };
export type Forecast = {
  next: { day: string; start_time: string; end_time: string };
  basis: "official" | "every_second_day" | "history";
  confidence: "high" | "medium" | "low";
  tier: ReservoirTier | null;
  note: string;
  source_url: string | null;
};
export type Quality = {
  level: "none" | "cloudy_possible" | "official_notice";
  message: string;
  notice?: { title: string; day: string; source_url: string };
};
export type QualityNotice = { area: string; day: string; title: string; category: string; source_url: string };

/** Minutes -> "HH:MM", wrapping around midnight. */
const hm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** Length of a window in minutes; a window that ends "earlier" than it starts crosses midnight. */
export const windowLength = (w: Win) => {
  const s = toMin(w.start_time), e = toMin(w.end_time);
  return e > s ? e - s : e + 1440 - s;
};
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Op 27: the household's day around one window. Minutes from the window start, for each step (reminder = -30). */
export function planDay(w: Win): (PlanStep & { offset: number })[] {
  const s = toMin(w.start_time), len = windowLength(w);
  const at = (offset: number, label: string, kind: PlanStep["kind"]) => ({ time: hm(s + offset), label, kind, offset });
  return [
    at(-30, "Reminder: water in 30 minutes. Start the pump.", "remind"),
    at(0, "Water arrives (official window starts)", "arrive"),
    at(0, "Fill the tank first, then buckets and bottles", "task"),
    ...(len >= 210 ? [at(180, "Run the washing machine", "task")] : []), // 3 h in, if 30 min are still left after it
    ...(len >= 60 ? [at(len - 30, "Finish laundry and top up before the water stops", "task")] : []),
    at(len, "Water ends", "end"),
  ];
}

/** Op 24: official next window, else every second day from the last official one, else neighbours' usual time. Never overrides an official window. */
export function forecastNext(o: { today: string; official: { day: string; win: Win | null }[]; likely: LikelyWaterTime | null; tier: ReservoirTier | null }): Forecast | null {
  const tierNote = o.tier === "critical" ? "; reservoir is critical, cuts may get longer" : o.tier === "watch" ? "; reservoir at watch level" : "";
  const known = o.official.filter((d): d is { day: string; win: Win } => !!d.win).sort((a, b) => a.day.localeCompare(b.day));
  const next = known.find((d) => d.day > o.today);
  if (next) {
    return { next: { day: next.day, start_time: next.win.start_time, end_time: next.win.end_time }, basis: "official", confidence: "high", tier: o.tier, note: "From the official CWA timetable", source_url: next.win.source_url && next.win.source_url !== "#" ? next.win.source_url : null };
  }
  const last = known[known.length - 1];
  if (last) {
    let day = last.day;
    while (day <= o.today) day = addDays(day, 2);
    return { next: { day, start_time: last.win.start_time, end_time: last.win.end_time }, basis: "every_second_day", confidence: o.tier === "critical" ? "low" : "medium", tier: o.tier, note: `Every second day, like the last official window on ${last.day}${tierNote}`, source_url: null };
  }
  if (o.likely) {
    return { next: { day: addDays(o.today, 1), start_time: o.likely.from, end_time: o.likely.to }, basis: "history", confidence: "low", tier: o.tier, note: `When neighbours usually reported water (${o.likely.days_hit} of ${o.likely.days_total} days)${tierNote}`, source_url: null };
  }
  return null;
}

/** Op 26. Fixed messages only: never says water is safe or unsafe to drink. A notice counts for 30 days. */
export function waterQuality(tier: ReservoirTier | null, notices: QualityNotice[], area: string | null, today: string): Quality {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const n = notices
    .filter((x) => ["boil", "quality"].includes(x.category) && x.day <= today && x.day >= addDays(today, -30))
    .filter((x) => !x.area || fold(x.area) === "all" || (area !== null && fold(x.area).includes(fold(area))))
    .sort((a, b) => b.day.localeCompare(a.day))[0];
  if (n) return { level: "official_notice", message: "There is an official water notice for your area. Follow it and the CWA / Ministry of Health advice.", notice: { title: n.title, day: n.day, source_url: n.source_url } };
  if (tier === "watch" || tier === "critical") {
    return { level: "cloudy_possible", message: "When reservoirs are low, tap water can look cloudy. Report dirty water. Follow official CWA / Ministry of Health advice." };
  }
  return { level: "none", message: "No official water-quality notice for your area in our sources. Kot Delo? never judges whether water is safe to drink." };
}

/** A calendar event for the window with an alarm 30 min before. Floating local time: the phone's own time zone. */
export function icsFile(day: string, w: Win, place: string, stamp: Date): string {
  const d = day.replaceAll("-", "");
  const t = (s: string) => `${s.replace(":", "")}00`;
  const crosses = toMin(w.end_time) <= toMin(w.start_time);
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kot Delo//Water reminder//EN",
    "BEGIN:VEVENT",
    `UID:${d}-${t(w.start_time)}-${Math.abs(hash(place))}@kotdelo`,
    `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${d}T${t(w.start_time)}`,
    `DTEND:${crosses ? addDays(day, 1).replaceAll("-", "") : d}T${t(w.end_time)}`,
    `SUMMARY:${esc(`Water supply in ${place} (CWA window)`)}`,
    `DESCRIPTION:${esc("Official CWA window, a planned time, not a promise. Fill the tank first. From Kot Delo?")}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT30M",
    `DESCRIPTION:${esc("Water in 30 minutes. Start the pump.")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/** Straight-line distance in km (haversine). */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("water-day.ts")) {
  const p = planDay({ start_time: "03:00", end_time: "08:00" });
  console.assert(p[0].time === "02:30" && p[0].kind === "remind", "reminder = start - 30 min");
  console.assert(p.map((s) => s.time).join() === "02:30,03:00,03:00,06:00,07:30,08:00", "03:00-08:00 day plan");
  const late = planDay({ start_time: "22:00", end_time: "02:00" });
  console.assert(late.at(-1)!.time === "02:00" && late.some((s) => s.time === "01:00") && windowLength({ start_time: "22:00", end_time: "02:00" }) === 240, "window over midnight");
  console.assert(!planDay({ start_time: "05:00", end_time: "07:00" }).some((s) => s.label.includes("washing")), "no machine when it does not fit");

  const w = { start_time: "03:00", end_time: "08:00", source_url: "u" };
  const official = forecastNext({ today: "2026-11-13", official: [{ day: "2026-11-13", win: w }, { day: "2026-11-15", win: w }], likely: null, tier: "watch" });
  console.assert(official?.basis === "official" && official.next.day === "2026-11-15" && official.confidence === "high", "official beats the rule");
  const rule = forecastNext({ today: "2026-11-14", official: [{ day: "2026-11-11", win: w }], likely: null, tier: "critical" });
  console.assert(rule?.basis === "every_second_day" && rule.next.day === "2026-11-15" && rule.confidence === "low", "rule skips to the right day, critical = low");
  const hist = forecastNext({ today: "2026-11-14", official: [], likely: { from: "04:00", to: "06:00", days_hit: 5, days_total: 7 }, tier: null });
  console.assert(hist?.basis === "history" && hist.next.day === "2026-11-15", "history fallback");
  console.assert(forecastNext({ today: "2026-11-14", official: [], likely: null, tier: null }) === null, "nothing to go on");

  const notice = { area: "Vacoas", day: "2026-11-10", title: "Boil water", category: "boil", source_url: "u" };
  console.assert(waterQuality("normal", [notice], "Vacoas", "2026-11-13").level === "official_notice", "official notice wins");
  console.assert(waterQuality("watch", [notice], "Moka", "2026-11-13").level === "cloudy_possible", "other area's notice ignored");
  console.assert(waterQuality("normal", [], "Vacoas", "2026-11-13").level === "none", "none");
  const all = [waterQuality("critical", [], null, "2026-11-13"), waterQuality("normal", [], null, "x"), waterQuality(null, [notice], "Vacoas", "2026-11-13")];
  console.assert(all.every((q) => !/\b(safe|unsafe) to drink\b/.test(q.message.replace("whether water is safe to drink", ""))), "never claims safe/unsafe");

  const ics = icsFile("2026-11-15", { start_time: "22:00", end_time: "02:00" }, "Vacoas", new Date(Date.UTC(2026, 10, 13, 10)));
  console.assert(ics.includes("DTSTART:20261115T220000") && ics.includes("DTEND:20261116T020000") && ics.includes("TRIGGER:-PT30M") && ics.includes("\r\n"), "ics with alarm, over midnight");
  console.assert(Math.abs(km({ lat: -20.24, lng: 57.49 }, { lat: -20.25, lng: 57.5 }) - 1.5) < 0.1, "km");
  console.log("water-day ok");
}

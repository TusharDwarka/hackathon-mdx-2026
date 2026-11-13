// Water-day helpers for the resident screen (docs/WATER-DAY-SPLIT.md). The rules themselves are P3's
// (lib/queries.ts: planDay op 27, computeForecast op 24, computeWaterQuality op 26); this file only adds
// what the screen needs on top: step offsets for "now", the calendar file for the reminder, distances.
// Self-check: npx tsx components/home/water-day.ts
import { toMin } from "@/components/home/time";
import { planDay, type PlanStep } from "@/lib/queries";

export type Win = { start_time: string; end_time: string };

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Minutes from the window start for each step of P3's planDay (reminder = -30; works over midnight). */
export function withOffsets(steps: PlanStep[], w: Win): (PlanStep & { offset: number })[] {
  const s = toMin(w.start_time);
  return steps.map((st) => ({ ...st, offset: st.kind === "remind" ? -30 : (toMin(st.time) - s + 1440) % 1440 || (st.kind === "end" ? 1440 : 0) }));
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
    "METHOD:PUBLISH",
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
  ].map(fold).join("\r\n") + "\r\n";
}
/** RFC 5545 line folding: at most 75 bytes per line, continued with CRLF + space (strict calendar apps need it). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  return [...out, cur].join("\r\n ");
}
/** Android: the Google Calendar app cannot import .ics, so this opens its "new event" page instead.
 *  Times in Mauritius time; the reminder is the account's default (30 min unless the user changed it). */
export function googleCalUrl(day: string, w: Win, place: string): string {
  const d = day.replaceAll("-", "");
  const t = (s: string) => `${s.replace(":", "")}00`;
  const end = toMin(w.end_time) <= toMin(w.start_time) ? addDays(day, 1).replaceAll("-", "") : d;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Water supply in ${place} (CWA window)`,
    dates: `${d}T${t(w.start_time)}/${end}T${t(w.end_time)}`,
    details: "Official CWA window, a planned time. Fill the tank first. From Kot Delo?",
    ctz: "Indian/Mauritius",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/** Straight-line distance in km (haversine). */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("water-day.ts")) {
  const p = withOffsets(planDay({ start_time: "03:00", end_time: "08:00" }), { start_time: "03:00", end_time: "08:00" });
  console.assert(p[0].kind === "remind" && p[0].offset === -30 && p.at(-1)!.offset === 300, "offsets: reminder -30, end +5 h");
  const late = withOffsets(planDay({ start_time: "22:00", end_time: "02:00" }), { start_time: "22:00", end_time: "02:00" });
  console.assert(late.at(-1)!.offset === 240, "window over midnight");

  const ics = icsFile("2026-11-15", { start_time: "22:00", end_time: "02:00" }, "Vacoas", new Date(Date.UTC(2026, 10, 13, 10)));
  console.assert(ics.includes("DTSTART:20261115T220000") && ics.includes("DTEND:20261116T020000") && ics.includes("TRIGGER:-PT30M") && ics.includes("\r\n"), "ics with alarm, over midnight");
  const g = new URL(googleCalUrl("2026-11-15", { start_time: "22:00", end_time: "02:00" }, "Vacoas"));
  console.assert(g.searchParams.get("dates") === "20261115T220000/20261116T020000" && g.searchParams.get("ctz") === "Indian/Mauritius", "google link over midnight");
  console.assert(ics.split(String.fromCharCode(13, 10)).every((l) => new TextEncoder().encode(l).length <= 75), "ics lines fit 75 octets");
  console.assert(Math.abs(km({ lat: -20.24, lng: 57.49 }, { lat: -20.25, lng: 57.5 }) - 1.5) < 0.1, "km");
  console.log("water-day ok");
}

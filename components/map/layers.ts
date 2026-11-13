// Map layer rules (docs/NEXT-TASK-SPLIT.md, P4 steps 2-4). Pure, no database, no model.
// Self-check: npx tsx components/map/layers.ts
import { streetStatuses, type RecentReport } from "@/components/ops/rules";

// ---------- Step 2: historical supply reliability (blue scale) ----------

export const RELIABILITY_DAYS = 14;
/** days_hit = days with at least one "water is here" report. share = null when the street has no reports at all. */
export type Reliability = { days_hit: number; days_total: number; reports: number; share: number | null };

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function streetReliability(streetIds: number[], reports: RecentReport[], now = Date.now(), days = RELIABILITY_DAYS): Record<number, Reliability> {
  const since = now - days * 86_400_000;
  const out: Record<number, Reliability> = {};
  for (const id of streetIds) out[id] = { days_hit: 0, days_total: days, reports: 0, share: null };
  const hit = new Map<number, Set<string>>();
  for (const r of reports) {
    const t = new Date(r.created_at).getTime();
    const row = out[r.street_id];
    if (!row || t < since || t > now) continue;
    row.reports++;
    if (r.type === "water_on") hit.set(r.street_id, (hit.get(r.street_id) ?? new Set()).add(dayKey(t)));
  }
  for (const [id, row] of Object.entries(out)) {
    if (row.reports === 0) continue; // unknown, not "never had water"
    row.days_hit = hit.get(Number(id))?.size ?? 0;
    row.share = row.days_hit / days;
  }
  return out;
}

/** Darker blue = water reported on more days. Grey = no reports, so unknown. */
const BLUE = [
  { min: 0.5, hex: "#1e40af", label: (d: number) => `water on ${Math.ceil(d / 2)}+ of ${d} days` },
  { min: 0.25, hex: "#3b82f6", label: (d: number) => `${Math.ceil(d / 4)} to ${Math.ceil(d / 2) - 1} days` },
  { min: 0.0001, hex: "#93c5fd", label: (d: number) => `1 to ${Math.ceil(d / 4) - 1} days` },
  { min: 0, hex: "#dbeafe", label: () => "no water reported" },
];
export const UNKNOWN_HEX = "#a1a1aa";
export const reliabilityHex = (share: number | null | undefined) => (share == null ? UNKNOWN_HEX : BLUE.find((b) => share >= b.min)!.hex);
export const reliabilityLegend = (days = RELIABILITY_DAYS) => [...BLUE.map((b) => ({ hex: b.hex, label: b.label(days) })), { hex: UNKNOWN_HEX, label: "unknown: no reports" }];

// ---------- Step 4: resident reports are street-level signals, never house pins ----------

export type Signal = { street_id: number; type: "water_on" | "water_off"; reports: number; confirmed: boolean; text: string; context: string | null };

/** Reports of the last 3 h per street (same rule as op 15). One report never confirms anything. */
export function reportSignals(streets: { id: number; order_index: number }[], reports: RecentReport[], now = Date.now()): Record<number, Signal> {
  const out: Record<number, Signal> = {};
  for (const s of streetStatuses(streets, reports, now)) {
    if (s.status === "none" || !s.type) continue;
    const what = s.type === "water_on" ? "water is here" : "no water";
    const confirmed = s.status === "confirmed";
    out[s.street_id] = {
      street_id: s.street_id,
      type: s.type,
      reports: s.reports,
      confirmed,
      text: s.reports === 1
        ? `A resident reported ${what} near this street (1 report, unconfirmed)`
        : `${s.reports} reports near this street, mostly ${what}${confirmed ? "" : " (unconfirmed)"}`,
      context: s.status === "suspect" ? "Neighbouring streets report the opposite. Context only, not proof either way." : null,
    };
  }
  return out;
}

// ---------- Step 3: official notices from the CWA timetable ----------

export type ScheduleRow = { area_id: number; day: string; start_time: string; end_time: string; source_url: string | null; source_date: string | null };
export type Notice = {
  area_id: number;
  kind: "interruption" | "supply";
  from: Date | null; // null: start not in the timetable
  to: Date; // the notice expires here and leaves the layer
  text: string;
  source_url: string | null;
  source_date: string | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const at = (d: Date, hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

/** Expand timetable rows (a date, or a weekday name) into real [start, end] windows around now. */
function windows(rows: ScheduleRow[], now: Date) {
  const out: { start: Date; end: Date; row: ScheduleRow }[] = [];
  for (const row of rows) {
    const days: Date[] = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.day)) days.push(new Date(`${row.day}T00:00:00`));
    else {
      const wd = WEEKDAYS.indexOf(row.day.slice(0, 3));
      for (let i = -8; wd >= 0 && i <= 8; i++) { const d = new Date(now); d.setDate(d.getDate() + i); if (d.getDay() === wd) days.push(d); }
    }
    for (const d of days) {
      const start = at(d, row.start_time.slice(0, 5));
      const end = at(d, row.end_time.slice(0, 5));
      if (end <= start) end.setDate(end.getDate() + 1); // overnight window
      out.push({ start, end, row });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

const fmt = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The official notice active now for one area: inside a supply window -> "supply until",
 * between windows -> "planned interruption until the next window".
 * Null when the published timetable has no window ahead (nothing official to show).
 */
export function areaNotice(rows: ScheduleRow[], now = new Date()): Notice | null {
  if (!rows.length) return null;
  const ws = windows(rows, now);
  const inside = ws.find((w) => w.start <= now && now < w.end);
  const base = (w: (typeof ws)[number]) => ({ area_id: w.row.area_id, source_url: w.row.source_url, source_date: w.row.source_date });
  if (inside) return { ...base(inside), kind: "supply", from: inside.start, to: inside.end, text: `Official supply window now, until ${fmt(inside.end)}` };
  const next = ws.find((w) => w.start > now);
  if (!next) return null;
  const prev = [...ws].reverse().find((w) => w.end <= now) ?? null;
  return { ...base(next), kind: "interruption", from: prev?.end ?? null, to: next.start, text: `Planned interruption: no supply until ${fmt(next.start)}` };
}

export const noticeTimes = (n: Notice) => `${n.from ? fmt(n.from) : "from the timetable start"} to ${fmt(n.to)}`;

// ---------- self-check ----------
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("layers.ts")) {
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } };
  const now = new Date("2026-11-13T10:00:00").getTime();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

  const rel = streetReliability([1, 2, 3], [
    { street_id: 1, type: "water_on", created_at: ago(2) }, { street_id: 1, type: "water_on", created_at: ago(3) }, // same day
    { street_id: 1, type: "water_on", created_at: ago(30) },
    { street_id: 2, type: "water_off", created_at: ago(5) },
    { street_id: 3, type: "water_on", created_at: ago(24 * 20) }, // outside 14 days
  ], now);
  ok(rel[1].days_hit === 2 && rel[1].share === 2 / 14, "two distinct days with water");
  ok(rel[2].share === 0 && reliabilityHex(rel[2].share) === "#dbeafe", "only 'no water' reports -> palest blue, not unknown");
  ok(rel[3].share === null && reliabilityHex(rel[3].share) === UNKNOWN_HEX, "no reports in period -> grey unknown");
  ok(reliabilityHex(0.6) === "#1e40af", "high share -> dark blue");

  const sig = reportSignals([{ id: 1, order_index: 1 }, { id: 2, order_index: 2 }, { id: 3, order_index: 3 }], [
    { street_id: 1, type: "water_off", created_at: ago(0.5) },
    { street_id: 2, type: "water_on", created_at: ago(0.2) },
    { street_id: 3, type: "water_off", created_at: ago(0.4) }, { street_id: 3, type: "water_off", created_at: ago(1) },
  ], now);
  ok(!sig[1].confirmed && sig[1].text.includes("1 report, unconfirmed"), "one report stays unconfirmed");
  ok(!sig[2].confirmed && sig[2].context !== null, "contradicting neighbours = context, still just unconfirmed");
  ok(sig[3].confirmed, "two agreeing reports -> confirmed");

  const tt: ScheduleRow[] = ["2026-11-13", "2026-11-15"].map((day) => ({ area_id: 1, day, start_time: "03:00:00", end_time: "08:00:00", source_url: "x", source_date: "2026-10-10" }));
  const gap = areaNotice(tt, new Date("2026-11-13T10:00:00"))!;
  ok(gap.kind === "interruption" && gap.from!.getHours() === 8 && gap.to.getDate() === 15 && gap.to.getHours() === 3, "between windows -> interruption until next window");
  ok(areaNotice(tt, new Date("2026-11-15T05:00:00"))!.kind === "supply", "inside a window -> supply notice");
  ok(areaNotice(tt, new Date("2026-11-16T10:00:00")) === null, "timetable ran out -> notice expired, nothing shown");
  const weekly = areaNotice([{ area_id: 1, day: "Mon", start_time: "05:00", end_time: "09:00", source_url: null, source_date: null }], new Date("2026-11-13T10:00:00"));
  ok(weekly?.kind === "interruption" && weekly.to.getDay() === 1, "weekday timetable -> next Monday");

  if (!process.exitCode) console.log("layers ok");
}

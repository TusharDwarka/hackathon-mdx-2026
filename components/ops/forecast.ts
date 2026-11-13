// Reservoir trend (op 25) and next-window forecast (op 24) for /ops (docs/WATER-DAY-SPLIT.md, P4 items 1-3).
// LOCAL STAND-INS in P3's shapes: /ops calls P3's API first and only uses these when it is not deployed yet.
// Fallback data is real and sourced: data/reservoir.csv (Mare aux Vacoas, Sep to Nov 2026) and the latest
// data_date row per reservoir in data/reservoir_levels.csv. Every forecast is an estimate, never a promise.
// Self-check: npx tsx components/ops/forecast.ts
import { latestReservoirs, type ReservoirLatest, type ReservoirReading } from "@/lib/queries";
import type { ScheduleRow } from "@/components/map/layers";
import type { Tier } from "@/components/ops/rules";

// ---------- shapes (contracts/api.md ops 24, 25 as given in docs/WATER-DAY-SPLIT.md) ----------

export type Forecast = {
  next: { day: string; start_time: string; end_time: string };
  basis: "official" | "every_second_day" | "history";
  confidence: "high" | "medium" | "low";
  tier: Tier | null;
  note: string;
  source_url: string | null;
};
export type Trend = {
  reservoir: string; latest_pct: number; latest_day: string;
  pct_per_day: number; // negative = falling (least-squares slope)
  days_to_30: number | null; days_to_20: number | null; // null if rising or < 3 points
  points: { day: string; level_pct: number }[];
  projection: { day: string; level_pct: number }[]; // next 30 days
};

// ---------- fallback data (real, sourced) ----------

/** data/reservoir.csv: the 7 dated Mare aux Vacoas readings. */
export const MAV_HISTORY: { day: string; level_pct: number; source_url: string }[] = [
  { day: "2026-09-25", level_pct: 38.5, source_url: "https://defimedia.info/mare-aux-vacoas-le-reservoir-pourrait-atteindre-le-seuil-critique-de-20-vers-la-fin-de-novembre" },
  { day: "2026-09-28", level_pct: 37.3, source_url: "https://defimedia.info/mare-aux-vacoas-le-taux-de-remplissage-pourrait-atteindre-20-fin-novembre-la-wrc-appelle-economiser" },
  { day: "2026-10-02", level_pct: 36.6, source_url: "https://defimedia.info/mare-aux-vacoas-le-niveau-deau-chute-366-la-cwa-appelle-une-utilisation-judicieuse" },
  { day: "2026-10-16", level_pct: 34.6, source_url: "https://ionnews.mu/urgence-hydrique-8-ministeres-mobilises-alors-que-la-mare-aux-vacoas-chute-a-346/" },
  { day: "2026-10-19", level_pct: 34.2, source_url: "https://defimedia.info/mare-aux-vacoas-pourrait-atteindre-20-fin-novembre" },
  { day: "2026-10-30", level_pct: 33.8, source_url: "https://ionnews.mu/niveau-des-reservoirs-la-barre-des-50-frolee-mare-aux-vacoas-chute-drastiquement-a-338/" },
  { day: "2026-11-05", level_pct: 33.0, source_url: "https://defimedia.info/eau-les-principaux-reservoirs-remplis-496-les-fournisseurs-reclament-une-revision-de-la-subvention" },
];
/** The press figure we compare against (shown next to our estimate, never hidden). */
export const PRESS_20PCT = { text: "Press: 20% by the end of November", url: MAV_HISTORY[0].source_url };

const AF_JUL = "https://fr.allafrica.com/stories/202607080216.html";
/** Latest reading per reservoir from the data files (names as scripts/load-data.ts stores them). */
const FALLBACK_LATEST: ReservoirReading[] = [
  { reservoir: "Mare aux Vacoas", day: "2026-11-05", level_pct: 33.0, source_url: MAV_HISTORY[6].source_url, date_basis: "reported", is_aggregate: false },
  { reservoir: "La Nicoliere", day: "2026-08-03", level_pct: 46.8, source_url: "https://fr.allafrica.com/stories/202608040353.html", date_basis: "data_date", is_aggregate: false },
  { reservoir: "La Ferme", day: "2026-07-06", level_pct: 46.8, source_url: AF_JUL, date_basis: "data_date", is_aggregate: false },
  { reservoir: "Bagatelle Dam", day: "2026-07-06", level_pct: 75.6, source_url: AF_JUL, date_basis: "data_date", is_aggregate: false },
  { reservoir: "Midlands Dam", day: "2026-07-06", level_pct: 81.0, source_url: AF_JUL, date_basis: "data_date", is_aggregate: false },
  { reservoir: "Mare Longue", day: "2026-07-06", level_pct: 86.9, source_url: AF_JUL, date_basis: "data_date", is_aggregate: false },
  { reservoir: "Piton du Milieu", day: "2026-07-06", level_pct: 89.0, source_url: AF_JUL, date_basis: "data_date", is_aggregate: false },
];

// ---------- pure rules ----------

const DAY = 86_400_000;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;
const isoDay = (n: number) => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Op 25 stand-in: least-squares line over the readings, 30 days of projection, days from today to 30% / 20%. */
export function trendOf(reservoir: string, rows: { day: string; level_pct: number }[], now = new Date()): Trend | null {
  const points = [...rows].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ day: r.day, level_pct: r.level_pct }));
  if (!points.length) return null;
  const last = points[points.length - 1];
  const xs = points.map((p) => dayNum(p.day)), ys = points.map((p) => p.level_pct);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = sxx ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  const at = (x: number) => my + slope * (x - mx);
  const today = dayNum(localIso(now));
  const daysTo = (level: number) => {
    if (points.length < 3 || slope >= 0) return null;
    return Math.max(0, Math.ceil(mx + (level - my) / slope - today));
  };
  const x0 = dayNum(last.day);
  return {
    reservoir,
    latest_pct: last.level_pct,
    latest_day: last.day,
    pct_per_day: Math.round(slope * 1000) / 1000,
    days_to_30: daysTo(30),
    days_to_20: daysTo(20),
    points,
    projection: Array.from({ length: 31 }, (_, i) => ({ day: isoDay(x0 + i), level_pct: round1(Math.max(0, Math.min(100, at(x0 + i)))) })),
  };
}

/**
 * Op 24 stand-in for one area: official timetable row on or after tomorrow (high), else the every-second-day
 * rule from the last official window (medium; low when the reservoir is critical). Null = nothing to base it on.
 */
export function forecastFrom(rows: ScheduleRow[], tier: Tier | null, now = new Date()): Forecast | null {
  const dated = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)).sort((a, b) => a.day.localeCompare(b.day));
  if (!dated.length) return null;
  const hm = (t: string) => t.slice(0, 5);
  const today = localIso(now);
  const official = dated.find((r) => r.day > today);
  if (official) {
    return {
      next: { day: official.day, start_time: hm(official.start_time), end_time: hm(official.end_time) },
      basis: "official", confidence: "high", tier,
      note: official.source_url ? `Official CWA timetable${official.source_date ? ` of ${official.source_date}` : ""}` : "Sample timetable (demo)",
      source_url: official.source_url,
    };
  }
  const last = dated[dated.length - 1];
  let day = dayNum(last.day);
  while (isoDay(day) <= today) day += 2;
  const critical = tier === "critical";
  return {
    next: { day: isoDay(day), start_time: hm(last.start_time), end_time: hm(last.end_time) },
    basis: "every_second_day", confidence: critical ? "low" : "medium", tier,
    note: `Every second day since ${dated[0].day}, last official window ${last.day}${tier === "watch" ? "; reservoir at watch level" : critical ? "; reservoir critical, cuts may get longer" : ""}`,
    source_url: last.source_url,
  };
}

/** Hours from now to the start of a forecast window (local time). */
export function hoursUntil(f: Forecast, now = new Date()): number {
  const [h, m] = f.next.start_time.split(":").map(Number);
  const start = new Date(`${f.next.day}T00:00:00`);
  start.setHours(h, m, 0, 0);
  return (start.getTime() - now.getTime()) / 3_600_000;
}
/** Dispatch hint: plan tankers where the next window is far (> 36 h) or the estimate is weak. */
export const needsTankers = (f: Forecast | null, now = new Date()) => !f || f.confidence === "low" || hoursUntil(f, now) > 36;

// ---------- loaders: P3's API first, local stand-in second ----------

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

export type Tanks = { reservoirs: ReservoirLatest[]; fromApi: boolean };
/** Latest reading per reservoir (GET /api/reservoirs), else the data-file fallback. */
export async function loadTanks(now = new Date()): Promise<Tanks> {
  try {
    const r = await getJson<{ reservoirs: ReservoirLatest[] }>("/api/reservoirs");
    if (r.reservoirs?.some((x) => x.state !== "missing")) return { reservoirs: r.reservoirs, fromApi: true };
  } catch { /* not deployed or no keys: fall through */ }
  return { reservoirs: latestReservoirs(FALLBACK_LATEST, now).reservoirs, fromApi: false };
}

/** Op 25. Only Mare aux Vacoas has enough recent readings for the local fallback. */
export async function loadTrend(reservoir: string, now = new Date()): Promise<{ trend: Trend | null; fromApi: boolean }> {
  try {
    return { trend: await getJson<Trend>(`/api/reservoirs/trend?reservoir=${encodeURIComponent(reservoir)}`), fromApi: true };
  } catch { /* fall through */ }
  return { trend: /vacoas/i.test(reservoir) ? trendOf("Mare aux Vacoas", MAV_HISTORY, now) : null, fromApi: false };
}

/** Op 24 for one area, else the local rule over that area's timetable rows. */
export async function loadForecast(areaId: number, rows: ScheduleRow[], tier: Tier | null, demo: boolean, now = new Date()): Promise<{ forecast: Forecast | null; fromApi: boolean }> {
  if (!demo) {
    try { return { forecast: await getJson<Forecast>(`/api/forecast?area_id=${areaId}`), fromApi: true }; } catch { /* fall through */ }
  }
  return { forecast: forecastFrom(rows.filter((r) => r.area_id === areaId), tier, now), fromApi: false };
}

// ---------- self-check ----------
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("forecast.ts")) {
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } };
  const now = new Date("2026-11-13T10:00:00");

  const t = trendOf("Mare aux Vacoas", MAV_HISTORY, now)!;
  ok(t.pct_per_day < -0.1 && t.pct_per_day > -0.15, `falling series -> slope about -0.12 %/day (got ${t.pct_per_day})`);
  ok(t.days_to_20 !== null && t.days_to_20 > 60 && t.days_to_20 < 120, `20% about mid-February (got ${t.days_to_20} days)`);
  ok(t.projection.length === 31 && t.projection[0].day === "2026-11-05", "30 days of projection from the latest reading");
  const up = trendOf("x", [{ day: "2026-10-01", level_pct: 40 }, { day: "2026-10-05", level_pct: 41 }, { day: "2026-10-09", level_pct: 43 }], now)!;
  ok(up.pct_per_day > 0 && up.days_to_20 === null, "rising series -> no date");
  ok(trendOf("x", MAV_HISTORY.slice(0, 2), now)!.days_to_20 === null, "< 3 points -> no date");

  const row = (day: string): ScheduleRow => ({ area_id: 1, day, start_time: "03:00:00", end_time: "08:00:00", source_url: "cwa", source_date: "2026-10-10" });
  const off = forecastFrom([row("2026-11-12"), row("2026-11-14")], "watch", now)!;
  ok(off.basis === "official" && off.confidence === "high" && off.next.day === "2026-11-14" && off.next.start_time === "03:00", "official row beats the rule");
  const rule = forecastFrom([row("2026-10-10"), row("2026-10-12")], "watch", now)!;
  ok(rule.basis === "every_second_day" && rule.next.day === "2026-11-15" && rule.confidence === "medium", `rule skips to the right day (got ${rule.next.day})`);
  ok(forecastFrom([row("2026-10-10")], "critical", now)!.confidence === "low", "critical reservoir -> low confidence");
  ok(forecastFrom([], null, now) === null, "no timetable -> no forecast");
  ok(needsTankers(rule, now) && !needsTankers({ ...off, next: { ...off.next, day: "2026-11-13", start_time: "20:00" } }, now), "far window -> plan tankers, near window -> not");

  const tanks = latestReservoirs(FALLBACK_LATEST, now).reservoirs;
  ok(tanks.every((r) => r.state !== "missing"), "fallback covers every main reservoir");

  if (!process.exitCode) console.log("forecast ok", { slope: t.pct_per_day, days_to_20: t.days_to_20, days_to_30: t.days_to_30 });
}

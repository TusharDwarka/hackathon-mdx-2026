"use client";

// Data loading and small helpers shared by the landing (/) and the resident screen (/resident).
// Real data through lib/queries.ts. Fallback (golden rule): database unreachable, or no
// streets loaded yet -> demo mode on lib/mock.ts with a visible banner.
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { getAreas, getHoursDry, getReliability, getStreets, getTodayWindow, type Reliability, type ReportType, type Street, type Window } from "@/lib/queries";
export type { ComplaintCategory } from "@/lib/queries";
import { MOCK_AREA, MOCK_HOURS_DRY, MOCK_STREETS, MOCK_WINDOW } from "@/lib/mock";
import type { Report } from "@/components/home/rules";

export type RequestStatus = "waiting" | "served"; // requests.status in contracts/api.md
export type Base = { streets: Street[]; areaNames: Record<number, string>; hoursDry: Record<number, number | null>; demo: boolean };
/** `reports` = the street's reports of the last 14 days, oldest first. */
export type StreetData = { id: number; failed?: boolean; reliability: Reliability; reports: Report[] };

// ---------- remembered on this phone only (locality, street, guest choice); nothing here is sent ----------
const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; } // private mode
};
const save = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: forgotten when the page closes */ }
};
export const readArea = () => Number(read("kotdelo.area")) || null;
export const saveArea = (id: number | null) => save("kotdelo.area", id === null ? null : String(id));
export const readStreet = () => Number(read("kotdelo.street")) || null;
export const saveStreet = (id: number | null) => save("kotdelo.street", id === null ? null : String(id));
// ponytail: "guest" is a local yes/no until P3's session API exists; then this asks P3 for a guest session.
export const readGuest = () => read("kotdelo.guest") === "1";
export const saveGuest = () => save("kotdelo.guest", "1");

// ---------- one report per street per 30 minutes (this phone only, no device id is sent) ----------
export const REPORT_LIMIT_MS = 30 * 60_000;
export type MyReport = { type: ReportType; at: number };
const reportKey = (streetId: number) => `kotdelo.report.${streetId}`;
export const readMyReport = (streetId: number): MyReport | null => {
  try { return JSON.parse(localStorage.getItem(reportKey(streetId)) ?? "null"); } catch { return null; }
};
export const saveMyReport = (streetId: number, report: MyReport | null) => save(reportKey(streetId), report && JSON.stringify(report));

// ---------- a clock that re-renders every 30 s ----------
// null on the server and the first hydration pass: pages are prerendered, so anything that needs "now" waits for the browser.
const TICK = 30_000;
const subscribeClock = (onTick: () => void) => {
  const t = setInterval(onTick, TICK);
  return () => clearInterval(t);
};
const clockSnapshot = () => Math.floor(Date.now() / TICK);
export function useNow(): Date | null {
  const tick = useSyncExternalStore(subscribeClock, clockSnapshot, () => 0);
  return tick ? new Date(tick * TICK) : null;
}

// ---------- streets, area names, heat map numbers ----------
const DEMO: Base = { streets: MOCK_STREETS, areaNames: { [MOCK_AREA.id]: MOCK_AREA.name }, hoursDry: MOCK_HOURS_DRY, demo: true };
const DB_WAIT_MS = 8000; // a dead network can hang for a long time before it fails; slow mobile data gets 8 s

/** `base` is null while loading. `retry` asks the database again (the "Try again" button in demo mode). */
export function useBase() {
  const [base, setBase] = useState<Base | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`database did not answer in ${DB_WAIT_MS / 1000} s`)), DB_WAIT_MS));
    Promise.race([Promise.all([getStreets(), getAreas(), getHoursDry()]), timeout])
      .then(([streets, areas, hoursDry]): Base => {
        if (!streets.length) throw new Error("no streets loaded yet");
        return { streets, areaNames: Object.fromEntries(areas.map((a) => [a.id, a.name])), hoursDry, demo: false };
      })
      .catch((e) => {
        console.warn("Kot Delo? is in demo mode:", e instanceof Error ? e.message : e);
        return DEMO;
      })
      .then((b) => {
        if (current) setBase(b);
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  const retry = () => {
    setBase(null);
    setAttempt((a) => a + 1);
  };
  return { base, setBase, retry };
}

// ---------- one street ----------
const EMPTY_RELIABILITY: Reliability = { onTime: 0, days: 0, perDay: [] };

// The street's reports of the last 14 days. Not in lib/queries.ts (P3 may move it there).
async function getRecentReports(streetId: number): Promise<Report[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const { data, error } = await supabase.from("reports").select("type,created_at").eq("street_id", streetId).gte("created_at", since).order("created_at");
  if (error) throw error;
  return (data ?? []) as Report[];
}

// Deterministic sample data for demo mode: later streets are worse, street 3 gives "on time 4 of 7".
function demoStreetData(id: number): StreetData {
  const at = (daysAgo: number, hour = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d;
  };
  const perDay = Array.from({ length: 7 }, (_, i) => ({ date: at(7 - i).toLocaleDateString("en-CA"), onTime: (i * 3) % 7 >= id })); // en-CA = YYYY-MM-DD
  const past = Array.from({ length: 13 }, (_, i) => i + 1)
    .filter((d) => (d + id) % 3 !== 0)
    .map((d) => ({ type: "water_on" as const, at: at(d, 5.5 + ((d * id) % 3) * 0.5) }));
  const today = [5.2, 5.9, 6.4, 7.6, 8.8].map((hour, i) => ({ type: (i * 2 + id) % 3 === 0 ? ("water_on" as const) : ("water_off" as const), at: at(0, hour) }));
  const lately = [100, 35].map((minAgo) => ({ type: "water_off" as const, at: new Date(Date.now() - minAgo * 60_000) }));
  const reports = [...past, ...today, ...lately]
    .filter((r) => r.at.getTime() < Date.now())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((r) => ({ type: r.type, created_at: r.at.toISOString() }));
  return { id, reliability: { onTime: perDay.filter((p) => p.onTime).length, days: perDay.length, perDay }, reports };
}

/** Reliability (op 10) and recent reports for one street. Never throws: `failed` is set instead. */
export function loadStreetData(streetId: number, demo: boolean): Promise<StreetData> {
  const load: Promise<StreetData> = demo
    ? Promise.resolve(demoStreetData(streetId))
    : Promise.all([getReliability(streetId), getRecentReports(streetId)]).then(([reliability, reports]) => ({ id: streetId, reliability, reports }));
  return load.catch((e): StreetData => {
    console.warn("street data not loaded:", e);
    return { id: streetId, failed: true, reliability: EMPTY_RELIABILITY, reports: [] };
  });
}

// ---------- one locality: the official timetable is per area, so no street is needed ----------
export const isoDay = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
/** `week`: the next 7 days from today, each with its official window or null. null = that part failed to load. */
export type AreaData = { id: number; failed?: boolean; win: Window | null; week: { day: string; win: Window | null }[] | null };

const next7 = () =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return isoDay(d);
  });

/** Today's window (op 1, through any street of the area) and the coming week. Never throws. */
export function loadArea(areaId: number, anyStreetId: number, demo: boolean): Promise<AreaData> {
  const days = next7();
  if (demo) return Promise.resolve({ id: areaId, win: MOCK_WINDOW, week: days.map((day, i) => ({ day, win: i % 2 ? null : MOCK_WINDOW })) });
  // Date-based timetables only (P5's schedule.csv uses dates); weekday rows are still covered by "today" through op 1.
  const week = (async () => {
    const { data, error } = await supabase.from("schedule").select("day,start_time,end_time,source_url,source_date").eq("area_id", areaId).in("day", days).order("start_time");
    if (error) throw error;
    const rows = (data ?? []).map((w): Window => ({ ...w, start_time: w.start_time.slice(0, 5), end_time: w.end_time.slice(0, 5) }));
    return days.map((day) => ({ day, win: rows.find((w) => w.day === day) ?? null }));
  })().catch((e) => {
    console.warn("week not loaded:", e); // the week list says so; today's window still shows
    return null;
  });
  return Promise.all([getTodayWindow(anyStreetId), week])
    .then(([win, wk]): AreaData => ({ id: areaId, win, week: wk }))
    .catch((e): AreaData => {
      console.warn("timetable not loaded:", e);
      return { id: areaId, failed: true, win: null, week: null };
    });
}

// ---------- small display helpers ----------
export const fmtHours = (h: number | null | undefined) => (h == null ? "no reports yet" : h < 1 ? "under 1 h" : `${Math.round(h)} h`);
/** "2026-10" (month only, some sources give no day) shows as "October 2026". */
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  iso.length === 7 ? new Date(`${iso}-01T00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : new Date(`${iso}T00:00`).toLocaleDateString("en-GB", opts);
export const daysOld = (iso: string, now: Date) => Math.floor((now.getTime() - new Date(`${iso}T00:00`).getTime()) / 86_400_000);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`wave-load block rounded-lg ${className}`} />; // span: it sits inside <p> too
}

/** Shown in demo mode. Not a dead end: "Try again" asks the database once more. */
export function DemoBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-amber-100 py-2 pr-2 pl-5 text-sm text-amber-950">
      <p className="flex-1 py-1">Demo mode: sample data. The database did not answer.</p>
      <button type="button" onClick={onRetry} className="min-h-12 shrink-0 rounded-full bg-amber-950 px-4 font-semibold text-amber-50 transition-[scale] duration-150 ease-snap active:scale-[0.97]">
        Try again
      </button>
    </div>
  );
}

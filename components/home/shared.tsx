"use client";

// Data loading and small helpers shared by the landing (/) and the resident screen (/resident).
// Real data through lib/queries.ts. Fallback (golden rule): database unreachable, or no
// streets loaded yet -> demo mode on lib/mock.ts with a visible banner.
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { getAreas, getHoursDry, getReliability, getStreets, getTodayWindow, type Reliability, type Street, type Window } from "@/lib/queries";
import { MOCK_AREA, MOCK_HOURS_DRY, MOCK_STREETS, MOCK_WINDOW } from "@/lib/mock";
import { reservoirTier, type Report, type ReservoirStatus } from "@/components/home/rules";

export type RequestStatus = "waiting" | "served"; // requests.status in contracts/api.md
export type Base = { streets: Street[]; areaNames: Record<number, string>; hoursDry: Record<number, number | null>; demo: boolean };
/** `reports` = the street's reports of the last 14 days, oldest first. */
export type StreetData = { id: number; failed?: boolean; win: Window | null; reliability: Reliability; reports: Report[] };

// ---------- the resident's street (remembered on this phone only) ----------
const STREET_KEY = "kotdelo.street";
export const readStreet = () => {
  try { return Number(localStorage.getItem(STREET_KEY)); } catch { return 0; } // private mode
};
export const saveStreet = (id: number) => {
  try { localStorage.setItem(STREET_KEY, String(id)); } catch { /* private mode */ }
};

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
const DB_WAIT_MS = 4000; // a dead network can hang for a long time before it fails

/** null while loading. */
export function useBase() {
  const [base, setBase] = useState<Base | null>(null);
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
  }, []);
  return { base, setBase };
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
  return { id, win: MOCK_WINDOW, reliability: { onTime: perDay.filter((p) => p.onTime).length, days: perDay.length, perDay }, reports };
}

/** Today's window (op 1), reliability (op 10) and recent reports for one street. Never throws: `failed` is set instead. */
export function loadStreetData(streetId: number, demo: boolean): Promise<StreetData> {
  const load: Promise<StreetData> = demo
    ? Promise.resolve(demoStreetData(streetId))
    : Promise.all([getTodayWindow(streetId), getReliability(streetId), getRecentReports(streetId)]).then(([win, reliability, reports]) => ({ id: streetId, win, reliability, reports }));
  return load.catch((e): StreetData => {
    console.warn("street data not loaded:", e);
    return { id: streetId, failed: true, win: null, reliability: EMPTY_RELIABILITY, reports: [] };
  });
}

// ---------- V2 stand-ins until P3's functions are on main (same shapes as contracts/api.md) ----------

/** Op 12. SAMPLE figure (`sample: true`): there is no reservoir_levels table or data/reservoir.csv yet. */
export async function getReservoirStatus(): Promise<ReservoirStatus & { sample: boolean }> {
  const level_pct = 35.9; // Mare aux Vacoas, October 2026, as reported in the press (see team/p5-pitch/numbers/README.md)
  return { level_pct, day: "2026-10-01", tier: reservoirTier(level_pct), sample: true };
}

// ---------- small display helpers ----------
export const fmtHours = (h: number | null | undefined) => (h == null ? "no reports yet" : h < 1 ? "under 1 h" : `${Math.round(h)} h`);
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00`).toLocaleDateString("en-GB", opts);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted motion-reduce:animate-none ${className}`} />;
}

export function DemoBanner() {
  return (
    <p className="rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-950">
      Demo mode: sample data. The real CWA timetable is not loaded or the database is not reachable.
    </p>
  );
}

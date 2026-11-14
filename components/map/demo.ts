// DEMO data for /map, /driver and /ops when the database is unreachable or empty. Never used live.
// Mock streets, sample reports, a sample timetable in the shape of the real CWA one, and the
// demo dispatch hand-off: /ops Dispatch "Send" saves it in this browser, /driver shows the rounds
// sent to Tanker A or B, /map follows the tanker that carries your street.
import { MOCK_STREETS } from "@/lib/mock";
import { ASSUMED_REQUEST_L } from "@/components/ops/dispatch";
import type { RecentReport } from "@/components/ops/rules";
import type { ScheduleRow } from "@/components/map/layers";
import type { LiveRound, Stop, Street, WaitingRequest, WaterPoint } from "@/components/map/data";

export const DEMO_STREETS: Street[] = MOCK_STREETS;
export const DEMO_AREA = { id: MOCK_STREETS[0].area_id, name: "Demo area (mock streets)" };

/** 6 waiting requests x 20 L = 120 L: the split's "two loads on a 100 L tank" example. */
export function demoWaiting(now = Date.now()): WaitingRequest[] {
  const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  return [
    [2, 30], [2, 50], [3, 20], [4, 15], [4, 40], [4, 90],
  ].map(([street_id, min]) => ({ street_id, created_at: at(min), litres: ASSUMED_REQUEST_L, assumed: true }));
}

/** Last 3 h: street 3 has one report against both neighbours, the rest agree or are single. */
export function demoRecentReports(now = Date.now()): RecentReport[] {
  const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  return [
    { street_id: 1, type: "water_on", created_at: at(12) }, { street_id: 1, type: "water_on", created_at: at(25) },
    { street_id: 2, type: "water_off", created_at: at(6) }, { street_id: 2, type: "water_off", created_at: at(40) },
    { street_id: 3, type: "water_on", created_at: at(9) },
    { street_id: 4, type: "water_off", created_at: at(15) }, { street_id: 4, type: "water_off", created_at: at(70) },
    { street_id: 5, type: "water_off", created_at: at(33) },
  ];
}

/** 14 days of "water is here" reports: street 1 often, street 4 rarely, street 5 never reported -> unknown. */
export function demoHistory(now = Date.now()): RecentReport[] {
  const out: RecentReport[] = [];
  const daysHit: Record<number, number> = { 1: 10, 2: 6, 3: 4, 4: 1 };
  for (const [id, n] of Object.entries(daysHit)) {
    for (let d = 1; d <= n; d++) out.push({ street_id: Number(id), type: "water_on", created_at: new Date(now - d * 86_400_000).toISOString() });
  }
  return [...out, ...demoRecentReports(now)];
}

/** Two sample water points next to the mock streets. Not real places: demo mode only, never shown live. */
export const DEMO_WATER_POINTS: WaterPoint[] = [
  { name: "Static tank (demo, not a real place)", kind: "static tank", lat: -20.2458, lng: 57.4962, source_url: null },
  { name: "Tanker stop (demo, not a real place)", kind: "tanker stop", lat: -20.2528, lng: 57.5082, source_url: null },
];

/** Every second day 03:00 to 08:00, the pattern of the real Vacoas notice, around today. Labelled as a sample. */
export function demoSchedule(now = new Date()): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (let i = -6; i <= 6; i += 2) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    rows.push({ area_id: DEMO_AREA.id, day, start_time: "03:00", end_time: "08:00", source_url: null, source_date: null });
  }
  return rows;
}

// ---------- demo dispatch hand-off (localStorage, this browser only) ----------

export type DemoDispatch = { created_at: string; rounds: { id: number; tanker: string; stops: { street_id: number; litres: number; trip: number }[] }[] };
const KEY = "kotdelo.demo-dispatch";

export function readDemoDispatch(): DemoDispatch | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as DemoDispatch) : null; } catch { return null; }
}
export function saveDemoDispatch(d: DemoDispatch | null) {
  try { if (d) localStorage.setItem(KEY, JSON.stringify(d)); else localStorage.removeItem(KEY); } catch { /* private mode: demo stays on this page */ }
}

/** Demo rounds as LiveRounds. No dispatch saved yet -> one demo round over every mock street. */
export function demoRounds(startedAt = new Date().toISOString()): LiveRound[] {
  const byId = new Map(DEMO_STREETS.map((s) => [s.id, s]));
  const saved = readDemoDispatch();
  const plans = saved?.rounds ?? [{ id: -1, tanker: "Tanker A", stops: DEMO_STREETS.map((s) => ({ street_id: s.id, litres: 0, trip: 1 })) }];
  return plans.map((p) => ({
    round: { id: p.id, status: "active", started_at: saved?.created_at ?? startedAt },
    label: p.tanker,
    stops: p.stops.flatMap((s, i): Stop[] => {
      const street = byId.get(s.street_id);
      return street ? [{ id: p.id * 100 - i - 1, round_id: p.id, street_id: s.street_id, stop_order: i + 1, served_at: null, street, litres: s.litres || undefined, trip: s.trip }] : [];
    }),
  }));
}

/** The demo truck (components/map/road.ts) ends each leg exactly on the stop. */
export const arrived = (pos: { lat: number; lng: number }, s: Street) => Math.hypot(s.lat - pos.lat, s.lng - pos.lng) < 0.0003;

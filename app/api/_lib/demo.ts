// Fallback inputs for the V4 routes when the database is unreachable or not migrated.
// REAL sourced values (copied from data/), but the response says demo: true so the UI labels it.
import type { TrendPoint } from "@/lib/queries";

/** Mare aux Vacoas readings from data/reservoir.csv (press reports of CWA figures). */
export const DEMO_MAV_READINGS: TrendPoint[] = [
  { day: "2026-09-25", level_pct: 38.5 },
  { day: "2026-09-28", level_pct: 37.3 },
  { day: "2026-10-02", level_pct: 36.6 },
  { day: "2026-10-16", level_pct: 34.6 },
  { day: "2026-10-19", level_pct: 34.2 },
  { day: "2026-10-30", level_pct: 33.8 },
  { day: "2026-11-05", level_pct: 33 },
  { day: "2026-11-12", level_pct: 33 },
];

const SCHEDULE_SOURCE = "https://cwa.govmu.org/cwa/wp-content/uploads/2026/10/Press-Notice-09102026.pdf";

/** data/schedule.csv: Vacoas, every second day 10 Oct to 29 Nov 2026, 03:00 to 08:00. */
export function demoSchedule() {
  const rows: { day: string; start_time: string; end_time: string; source_url: string; source_date: string }[] = [];
  for (let d = new Date(2026, 9, 10); d <= new Date(2026, 10, 29); d.setDate(d.getDate() + 2)) {
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    rows.push({ day, start_time: "03:00", end_time: "08:00", source_url: SCHEDULE_SOURCE, source_date: "2026-10-10" });
  }
  return rows;
}

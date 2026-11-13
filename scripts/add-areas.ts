// Adds more localities as full "live" areas (reports, tanker requests, 7-day timetable), WITHOUT
// touching existing rows (load-data.ts deletes all streets, which fails once reports exist).
//   node --env-file=.env.local --import tsx scripts/add-areas.ts
// Real data only: streets = OpenStreetMap names + positions from public/places.json (scripts/fetch-osm.ts),
// timetable = CWA hours from data/supply_rules.csv (basis locality_notice or regional_timetable, source kept).
// Also appends the rows to data/streets.csv and data/schedule.csv so the repo holds what the database holds.
import { appendFileSync, readFileSync } from "node:fs";
import { parseCsv } from "../components/home/public-data";
import { foldName, type Place } from "../lib/queries";
import { supabaseAdmin } from "../lib/supabase-server";

// [area name, places.json locality]. Areas already in schedule.csv (Phoenix, Curepipe, Floreal) keep their
// group timetable from the CWA notice and only get streets.
const LOCALITIES: [string, string][] = [
  ...["L’Escalier", "Rose-Belle", "Plaine Magnien", "Mahébourg", "Souillac", "Moka", "Port Louis", "Goodlands", "Triolet",
    "Grand Baie", "Pamplemousses", "Centre de Flacq", "Curepipe", "Phoenix"].map((n): [string, string] => [n, n]),
  ["Floreal", "Floréal"],
];
const MAX_STREETS = 25;
const DAYS = 30; // timetable rows from today; re-run to extend
const FROM = new Date(); // ponytail: local machine date, run it on a Mauritius-time machine

const places = JSON.parse(readFileSync("public/places.json", "utf8")) as Place[];
const rules = parseCsv(readFileSync("data/supply_rules.csv", "utf8")).filter((r) => r.basis !== "unknown" && r.start_time && r.end_time);
const iso = (d: Date) => d.toLocaleDateString("en-CA");
const csvCell = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Rows of the timetable for `days` days from `from`. every_2_days keeps the parity of valid_from. */
export function timetable(rs: Record<string, string>[], from: Date, days: number) {
  const out: { day: string; start_time: string; end_time: string; source_url: string; source_date: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    for (const r of rs) {
      if (r.frequency === "every_2_days") {
        const since = Math.round((new Date(`${iso(d)}T00:00`).getTime() - new Date(`${r.valid_from}T00:00`).getTime()) / 86_400_000);
        if (since < 0 || since % 2) continue;
      } else if (r.frequency !== "daily") continue;
      out.push({ day: iso(d), start_time: r.start_time, end_time: r.end_time, source_url: r.source_url, source_date: r.source_date });
    }
  }
  return out;
}

/** The locality's named streets nearest its centre, one per name. */
function streetsOf(name: string) {
  const own = places.filter((p) => foldName(p.l) === foldName(name) && p.l !== p.n);
  if (!own.length) throw new Error(`${name}: no streets in places.json`);
  // No locality point in OSM (e.g. Rose-Belle): the mean of its streets.
  const centre = places.find((p) => foldName(p.l) === foldName(name) && p.n === p.l) ?? { lat: own.reduce((s, p) => s + p.lat, 0) / own.length, lng: own.reduce((s, p) => s + p.lng, 0) / own.length };
  const seen = new Set<string>();
  return own
    .map((p) => ({ p, d: (p.lat - centre.lat) ** 2 + (p.lng - centre.lng) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .filter(({ p }) => !seen.has(foldName(p.n)) && seen.add(foldName(p.n)))
    .slice(0, MAX_STREETS)
    .map(({ p }, i) => ({ name: p.n, lat: p.lat, lng: p.lng, order_index: i + 1 }));
}

async function main() {
  const db = supabaseAdmin();
  const csvAreas = new Set(parseCsv(readFileSync("data/streets.csv", "utf8")).map((r) => foldName(r.area)));
  const csvRows = parseCsv(readFileSync("data/schedule.csv", "utf8"));
  for (const [name, placeName] of LOCALITIES) {
    // An area already in schedule.csv keeps those rows (CWA group timetable); the database gets them back from today.
    const fromCsv = csvRows.filter((r) => foldName(r.area) === foldName(name) && r.day >= iso(FROM));
    const hasSched = csvRows.some((r) => foldName(r.area) === foldName(name));
    const mine = rules.filter((r) => foldName(r.locality) === foldName(placeName));
    if (!mine.length && !hasSched) { console.warn(`${name}: no CWA hours in supply_rules.csv, skipped`); continue; }
    const streets = streetsOf(placeName);
    const sched = hasSched
      ? fromCsv.map((r) => ({ day: r.day, start_time: r.start_time, end_time: r.end_time, source_url: r.source_url, source_date: r.source_date }))
      : timetable(mine, FROM, DAYS);

    const { data: area, error: ae } = await db.from("areas").upsert({ name }, { onConflict: "name" }).select("id").single();
    if (ae) throw ae;
    const { count } = await db.from("streets").select("id", { count: "exact", head: true }).eq("area_id", area.id);
    if (!count) {
      const { error } = await db.from("streets").insert(streets.map((s) => ({ ...s, area_id: area.id })));
      if (error) throw error;
    }
    // Timetable: replace only this area's future rows (past days stay as they were).
    const { error: de } = await db.from("schedule").delete().eq("area_id", area.id).gte("day", iso(FROM));
    if (de) throw de;
    const { error: se } = await db.from("schedule").insert(sched.map((r) => ({ ...r, area_id: area.id })));
    if (se) throw se;

    if (!csvAreas.has(foldName(name))) {
      appendFileSync("data/streets.csv", streets.map((s) => `${[name, s.name].map(csvCell).join(",")},${s.lat},${s.lng},${s.order_index}\n`).join(""));
      if (!hasSched) appendFileSync("data/schedule.csv", sched.map((r) => [name, r.day, r.start_time, r.end_time, r.source_url, r.source_date].map(csvCell).join(",") + "\n").join(""));
    }
    console.log(`${name}: area ${area.id}, ${count || streets.length} streets, ${sched.length} timetable rows`);
  }
}

if (process.argv[1]?.endsWith("add-areas.ts")) {
  // Self-check: daily = every day, every_2_days follows valid_from.
  const t = timetable([{ frequency: "every_2_days", valid_from: "2026-10-10", start_time: "03:00", end_time: "08:00", source_url: "u", source_date: "d" }], new Date(2026, 10, 14), 4);
  console.assert(t.map((r) => r.day).join() === "2026-11-15,2026-11-17", "every second day from 10 Oct (as data/schedule.csv Vacoas)");
  console.assert(timetable([{ frequency: "daily", valid_from: "", start_time: "05:00", end_time: "08:00", source_url: "u", source_date: "d" }], new Date(2026, 10, 14), 3).length === 3, "daily");
  main().catch((e) => { console.error(e); process.exit(1); });
}

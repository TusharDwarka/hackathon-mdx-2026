// Loads REAL data from data/*.csv into Supabase. Run: npm run load-data
// Stops if schedule.csv or streets.csv is missing: we never invent timetable data.
import { existsSync, readFileSync } from "node:fs";
import Papa from "papaparse";
import { supabaseAdmin } from "../lib/supabase-server";

const SCHEDULE = "data/schedule.csv"; // area,day,start_time,end_time,source_url,source_date
const STREETS = "data/streets.csv"; // area,name,lat,lng,order_index
const RESERVOIR = "data/reservoir.csv"; // reservoir,day,level_pct,source_url (V2, optional: skipped when missing)

for (const f of [SCHEDULE, STREETS]) {
  if (!existsSync(f)) {
    console.error(`MISSING ${f}. Create it from the real CWA data (see data/README.md). Stopping.`);
    process.exit(1);
  }
}

const rows = (f: string) =>
  Papa.parse<Record<string, string>>(readFileSync(f, "utf8"), { header: true, skipEmptyLines: true }).data;

async function main() {
  const db = supabaseAdmin();
  const streets = rows(STREETS);
  const schedule = rows(SCHEDULE);

  const names = [...new Set([...streets, ...schedule].map((r) => r.area.trim()))];
  const { data: areas, error: ae } = await db
    .from("areas")
    .upsert(names.map((name) => ({ name })), { onConflict: "name" })
    .select();
  if (ae) throw ae;
  const areaId = Object.fromEntries(areas!.map((a) => [a.name, a.id]));

  // ponytail: delete-all then insert. Fails if reports/rounds already reference old streets; re-seed in that case.
  await db.from("schedule").delete().gte("id", 0);
  await db.from("streets").delete().gte("id", 0);

  const { error: se } = await db.from("streets").insert(
    streets.map((r) => ({
      area_id: areaId[r.area.trim()],
      name: r.name.trim(),
      lat: +r.lat,
      lng: +r.lng,
      order_index: +r.order_index,
    }))
  );
  if (se) throw se;
  const { error: te } = await db.from("schedule").insert(
    schedule.map((r) => ({
      area_id: areaId[r.area.trim()],
      day: r.day.trim(),
      start_time: r.start_time,
      end_time: r.end_time,
      source_url: r.source_url || null,
      source_date: r.source_date || null,
    }))
  );
  if (te) throw te;
  console.log(`Loaded ${names.length} areas, ${streets.length} streets, ${schedule.length} schedule rows.`);

  // V2: reservoir levels (needs sql/v2.sql). Upsert on (reservoir, day) so re-runs just refresh.
  if (!existsSync(RESERVOIR)) {
    console.log(`No ${RESERVOIR}: reservoir_levels not loaded (P5 adds it, see contracts/api.md op 12).`);
    return;
  }
  const levels = rows(RESERVOIR).map((r) => ({
    reservoir: r.reservoir.trim(),
    day: r.day.trim(),
    level_pct: +r.level_pct,
    source_url: r.source_url?.trim() || null,
  }));
  const { error: le } = await db.from("reservoir_levels").upsert(levels, { onConflict: "reservoir,day" });
  if (le) throw le;
  console.log(`Loaded ${levels.length} reservoir_levels rows.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

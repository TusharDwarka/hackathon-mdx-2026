// Loads REAL data from data/*.csv into Supabase. Run: npm run load-data
// Stops if schedule.csv or streets.csv is missing: we never invent timetable data.
import { existsSync, readFileSync } from "node:fs";
import Papa from "papaparse";
import { supabaseAdmin } from "../lib/supabase-server";

const SCHEDULE = "data/schedule.csv"; // area,day,start_time,end_time,source_url,source_date
const STREETS = "data/streets.csv"; // area,name,lat,lng,order_index

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
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

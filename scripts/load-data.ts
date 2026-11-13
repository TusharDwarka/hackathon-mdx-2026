// Loads REAL data from data/*.csv into Supabase. Run: npm run load-data
// Stops if schedule.csv or streets.csv is missing: we never invent timetable data.
// Optional files (reservoirs, notices, supply) are skipped with a notice when missing.
import { existsSync, readFileSync } from "node:fs";
import Papa from "papaparse";
import { supabaseAdmin } from "../lib/supabase-server";
import { matchArea, type Area } from "../lib/queries";

const SCHEDULE = "data/schedule.csv"; // area,day,start_time,end_time,source_url,source_date
const STREETS = "data/streets.csv"; // area,name,lat,lng,order_index
const RESERVOIR = "data/reservoir.csv"; // reservoir,day,level_pct,source_url (V2, optional: skipped when missing)
// V3, all optional (needs sql/v3.sql):
const RESERVOIR_LEVELS = "data/reservoir_levels.csv"; // date,date_basis,reservoir,fill_pct,source_url,note
const NOTICES = "data/notices.csv"; // kind,topic,areas,starts_at,ends_at,title,source_url,source_date (areas split by ';')
const SUPPLY = "data/supply.csv"; // locality,volume_m3,period_start,period_end,source_url
// V4, optional (needs sql/v4.sql): OFFICIAL quality / boil notices only.
const QUALITY = "data/quality_notices.csv"; // area,day,title,category,source_url (category boil | quality)

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

  await loadReservoirs(db);
  const { data: allAreas, error: aae } = await db.from("areas").select("id,name");
  if (aae) throw aae;
  await loadNotices(db, allAreas ?? []);
  await loadSupply(db, allAreas ?? []);
  await loadQualityNotices(db, allAreas ?? []);
}

/** Official quality / boil notices. "island-wide" / "all" / "Mauritius" applies to every area; other unmatched areas stay unmapped. */
async function loadQualityNotices(db: Db, areas: Area[]) {
  if (!existsSync(QUALITY)) {
    console.log(`No ${QUALITY}: quality notices not loaded (P5 adds official ones only; an empty file is fine).`);
    return;
  }
  const ISLAND = ["island wide", "island-wide", "all", "mauritius"];
  let bad = 0;
  const out = rows(QUALITY).flatMap((r) => {
    const area = r.area?.trim(), day = r.day?.trim(), title = r.title?.trim(), category = r.category?.trim(), source_url = r.source_url?.trim();
    if (!area || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") || !title || (category !== "boil" && category !== "quality") || !source_url) {
      bad++;
      return [];
    }
    const island = ISLAND.includes(area.toLowerCase());
    return [{ area, area_id: island ? null : matchArea(area, areas), island_wide: island, day, title, category, source_url }];
  });
  if (bad) console.warn(`${QUALITY}: ${bad} row(s) skipped (need area, day YYYY-MM-DD, title, category boil|quality, source_url).`);
  if (!out.length) return;
  const { error } = await db.from("quality_notices").upsert(out, { onConflict: "area,day,title" });
  if (isMissingColumnOrTable(error)) return console.warn("quality_notices not loaded: run sql/v4.sql first.");
  if (error) throw error;
  console.log(`Loaded ${out.length} quality notices (${out.filter((n) => !n.island_wide && n.area_id === null).length} with an area we do not map).`);
}

type Db = ReturnType<typeof supabaseAdmin>;
const isMissingColumnOrTable = (e: { code?: string } | null) => !!e && ["42703", "42P01", "PGRST204", "PGRST205"].includes(e.code ?? "");

// Source spellings -> one name per reservoir (lib/queries.ts MAIN_RESERVOIRS).
const RESERVOIR_NAMES: Record<string, string> = {
  "Mare-aux-Vacoas": "Mare aux Vacoas",
  "Mare-Longue": "Mare Longue",
  "Piton-du-Milieu": "Piton du Milieu",
  "La Nicolière": "La Nicoliere",
};
const AGGREGATE = "ALL_7_RESERVOIRS";
const BASIS_RANK: Record<string, number> = { data_date: 3, article_date: 2, reported: 1 };

/**
 * Reservoir levels from both files, one row per (reservoir, day). reservoir_levels.csv rows dated
 * "prior_year_comparison" are skipped (last year's value is not a current reading). The all-reservoir
 * total is kept apart (is_aggregate). For the same reservoir and day, a measurement date (data_date)
 * wins over an article date. Upsert on (reservoir, day) so re-runs just refresh.
 */
async function loadReservoirs(db: Db) {
  type Level = { reservoir: string; day: string; level_pct: number; source_url: string | null; date_basis: string; is_aggregate: boolean };
  const byKey = new Map<string, Level>();
  const add = (l: Level) => {
    if (!l.day || !Number.isFinite(l.level_pct)) return;
    const k = `${l.reservoir}|${l.day}`;
    const cur = byKey.get(k);
    if (!cur || (BASIS_RANK[l.date_basis] ?? 0) > (BASIS_RANK[cur.date_basis] ?? 0)) byKey.set(k, l);
  };
  if (existsSync(RESERVOIR)) {
    for (const r of rows(RESERVOIR)) {
      add({ reservoir: r.reservoir.trim(), day: r.day.trim(), level_pct: +r.level_pct, source_url: r.source_url?.trim() || null, date_basis: "reported", is_aggregate: false });
    }
  }
  let skipped = 0;
  if (existsSync(RESERVOIR_LEVELS)) {
    for (const r of rows(RESERVOIR_LEVELS)) {
      const basis = r.date_basis?.trim();
      if (basis !== "data_date" && basis !== "article_date") {
        skipped++;
        continue;
      }
      const name = r.reservoir.trim();
      const agg = name === AGGREGATE;
      add({ reservoir: agg ? "All 7 reservoirs" : RESERVOIR_NAMES[name] ?? name, day: r.date.trim(), level_pct: +r.fill_pct, source_url: r.source_url?.trim() || null, date_basis: basis, is_aggregate: agg });
    }
  }
  const levels = [...byKey.values()];
  if (!levels.length) {
    console.log(`No ${RESERVOIR} / ${RESERVOIR_LEVELS}: reservoir_levels not loaded.`);
    return;
  }
  const { error } = await db.from("reservoir_levels").upsert(levels, { onConflict: "reservoir,day" });
  if (isMissingColumnOrTable(error)) {
    // sql/v3.sql not run yet: load the V2 columns only, single reservoirs only.
    const v2 = levels.filter((l) => !l.is_aggregate).map(({ reservoir, day, level_pct, source_url }) => ({ reservoir, day, level_pct, source_url }));
    const { error: e2 } = await db.from("reservoir_levels").upsert(v2, { onConflict: "reservoir,day" });
    if (e2) throw e2;
    console.warn(`Loaded ${v2.length} reservoir_levels rows WITHOUT date_basis/aggregate: run sql/v3.sql, then load again.`);
    return;
  }
  if (error) throw error;
  const names = new Set(levels.filter((l) => !l.is_aggregate).map((l) => l.reservoir));
  console.log(`Loaded ${levels.length} reservoir_levels rows (${names.size} reservoirs + aggregate; ${skipped} prior-year rows skipped).`);
}

/** Official notices: one row per locality. Rows without kind, title, source_url or source_date are skipped, never completed. */
async function loadNotices(db: Db, areas: Area[]) {
  if (!existsSync(NOTICES)) {
    console.log(`No ${NOTICES}: notices not loaded (P5 adds verified CWA notices / advisories).`);
    return;
  }
  const KINDS = ["interruption", "rationing", "advisory"];
  const TOPICS = ["rainfall_flooding", "cyclone", "drought", "chemical_fuel", "water_quality", "other"];
  const out: Record<string, unknown>[] = [];
  let bad = 0;
  for (const r of rows(NOTICES)) {
    const kind = r.kind?.trim();
    const topic = r.topic?.trim() || null;
    if (!KINDS.includes(kind) || (topic && !TOPICS.includes(topic)) || !r.title?.trim() || !r.source_url?.trim() || !r.source_date?.trim()) {
      bad++;
      continue;
    }
    for (const locality of (r.areas ?? "").split(";").map((a) => a.trim()).filter(Boolean)) {
      out.push({
        kind, topic, locality, area_id: matchArea(locality, areas),
        starts_at: r.starts_at?.trim() || null, ends_at: r.ends_at?.trim() || null,
        title: r.title.trim(), source_url: r.source_url.trim(), source_date: r.source_date.trim(),
      });
    }
  }
  if (bad) console.warn(`${NOTICES}: ${bad} row(s) skipped (missing kind/title/source_url/source_date or unknown kind/topic).`);
  if (!out.length) return;
  const { error } = await db.from("notices").upsert(out, { onConflict: "kind,locality,title,source_url" });
  if (isMissingColumnOrTable(error)) return console.warn("notices not loaded: run sql/v3.sql first.");
  if (error) throw error;
  console.log(`Loaded ${out.length} notice rows (${out.filter((n) => n.area_id === null).length} with a locality we do not map).`);
}

/** Locality supply volumes in m3 for a stated period. */
async function loadSupply(db: Db, areas: Area[]) {
  if (!existsSync(SUPPLY)) {
    console.log(`No ${SUPPLY}: supply volumes not loaded (unknown until P5 finds a sourced figure).`);
    return;
  }
  const out = rows(SUPPLY)
    .filter((r) => r.locality?.trim() && Number.isFinite(+r.volume_m3) && r.period_start?.trim() && r.period_end?.trim() && r.source_url?.trim())
    .map((r) => ({
      locality: r.locality.trim(), area_id: matchArea(r.locality, areas), volume_m3: +r.volume_m3,
      period_start: r.period_start.trim(), period_end: r.period_end.trim(), source_url: r.source_url.trim(),
    }));
  if (!out.length) return;
  const { error } = await db.from("supply_volumes").upsert(out, { onConflict: "locality,period_start,period_end" });
  if (isMissingColumnOrTable(error)) return console.warn("supply_volumes not loaded: run sql/v3.sql first.");
  if (error) throw error;
  console.log(`Loaded ${out.length} supply_volumes rows.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

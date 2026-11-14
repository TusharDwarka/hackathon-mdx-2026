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
const WATER_POINTS = "data/water_points.csv"; // name,kind,lat,lng,source_url (sourced points only)
// V5, optional (needs sql/v5.sql): every town / village / suburb from OSM (scripts/fetch-osm.ts).
const LOCALITIES = "data/localities.csv"; // name,kind,district,lat,lng,source

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

  // Streets are UPSERTED on (area_id, name), never deleted: reports, requests, round_stops and complaints
  // point at street ids, so "delete all, insert all" fails once anyone has reported and inserts a second
  // copy of every street (the ids 1-21 / 22-42 bug). Streets that left the CSV are kept and counted.
  const { inserted, updated, kept } = await loadStreets(db, streets.map((r) => ({
    area_id: areaId[r.area.trim()],
    name: r.name.trim(),
    lat: +r.lat,
    lng: +r.lng,
    order_index: +r.order_index,
  })));

  // Nothing references schedule, so replacing it is safe. The delete error is checked, not ignored.
  const { error: de } = await db.from("schedule").delete().gte("id", 0);
  if (de) throw de;
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
  console.log(
    `Loaded ${names.length} areas, ${streets.length} streets (${inserted} new, ${updated} updated, ${kept} already in the database but not in the CSV, kept), ${schedule.length} schedule rows.`
  );

  await loadReservoirs(db);
  const { data: allAreas, error: aae } = await db.from("areas").select("id,name");
  if (aae) throw aae;
  await loadNotices(db, allAreas ?? []);
  await loadSupply(db, allAreas ?? []);
  await loadQualityNotices(db, allAreas ?? []);
  await loadWaterPoints(db);
  await loadLocalities(db);
}

type StreetRow = { area_id: number; name: string; lat: number; lng: number; order_index: number };

/**
 * Upsert streets on (area_id, name) so re-runs refresh coordinates and order instead of adding copies.
 * Needs the unique index from sql/v6.sql. Without it (code 42P10) we fall back to inserting only the
 * streets that are missing, so the database still never gets a second copy, and we say what to run.
 * Streets in the database but not in the CSV are left alone: rows may point at them.
 */
async function loadStreets(db: Db, rows: StreetRow[]) {
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = `${r.area_id}|${r.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length !== rows.length) console.warn(`${STREETS}: ${rows.length - unique.length} duplicate (area, name) row(s) in the CSV, first one kept.`);

  const { data: existing, error: ee } = await db.from("streets").select("id,area_id,name").range(0, 9999);
  if (ee) throw ee;
  const have = new Set((existing ?? []).map((s) => `${s.area_id}|${s.name}`));
  const inserted = unique.filter((r) => !have.has(`${r.area_id}|${r.name}`)).length;
  const kept = (existing ?? []).filter((s) => !seen.has(`${s.area_id}|${s.name}`)).length;

  const { error } = await db.from("streets").upsert(unique, { onConflict: "area_id,name" });
  if (error?.code === "42P10") {
    // No unique index yet: insert the missing streets only, update nothing.
    const missing = unique.filter((r) => !have.has(`${r.area_id}|${r.name}`));
    if (missing.length) {
      const { error: ie } = await db.from("streets").insert(missing);
      if (ie) throw ie;
    }
    console.warn("streets: no unique key on (area_id, name), so existing streets were NOT refreshed. Run sql/v6.sql, then load again.");
    return { inserted, updated: 0, kept };
  }
  if (error) throw error;
  return { inserted, updated: unique.length - inserted, kept };
}

/** OSM localities for the island-wide search and map. Rows without a name, district, source or with bad coordinates are skipped. */
async function loadLocalities(db: Db) {
  if (!existsSync(LOCALITIES)) {
    console.log(`No ${LOCALITIES}: localities not loaded (run npx tsx scripts/fetch-osm.ts).`);
    return;
  }
  let bad = 0;
  const out = rows(LOCALITIES).flatMap((r) => {
    const name = r.name?.trim(), kind = r.kind?.trim(), district = r.district?.trim(), source = r.source?.trim();
    const lat = +r.lat, lng = +r.lng;
    if (!name || !kind || !district || !source || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      bad++;
      return [];
    }
    return [{ name, kind, district, lat, lng, source }];
  });
  if (bad) console.warn(`${LOCALITIES}: ${bad} row(s) skipped (need name, kind, district, lat, lng, source).`);
  if (!out.length) return;
  const { error } = await db.from("localities").upsert(out, { onConflict: "name,district" });
  if (isMissingColumnOrTable(error)) return console.warn("localities not loaded: run sql/v5.sql first.");
  if (error) throw error;
  console.log(`Loaded ${out.length} localities.`);
}

/** Tanker stops / standpipes / static tanks for P4's map layer. Rows without a source or with bad coordinates are skipped. */
async function loadWaterPoints(db: Db) {
  if (!existsSync(WATER_POINTS)) {
    console.log(`No ${WATER_POINTS}: water points not loaded (P5 adds sourced points only).`);
    return;
  }
  let bad = 0;
  const out = rows(WATER_POINTS).flatMap((r) => {
    const name = r.name?.trim(), kind = r.kind?.trim(), source_url = r.source_url?.trim();
    const lat = +r.lat, lng = +r.lng;
    if (!name || !kind || !source_url || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      bad++;
      return [];
    }
    return [{ name, kind, lat, lng, source_url }];
  });
  if (bad) console.warn(`${WATER_POINTS}: ${bad} row(s) skipped (need name, kind, lat, lng, source_url).`);
  if (!out.length) return;
  const { error } = await db.from("water_points").upsert(out, { onConflict: "name,kind" });
  if (isMissingColumnOrTable(error)) return console.warn("water_points not loaded: run sql/v4.sql first.");
  if (error) throw error;
  console.log(`Loaded ${out.length} water points.`);
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

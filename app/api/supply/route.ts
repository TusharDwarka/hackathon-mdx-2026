// GET /api/supply  P5's data/supply_rules.csv for every locality, as compact JSON.
// No request data is read, so with cacheComponents this GET is prerendered at build time: the CSV is read on
// the build machine, never at request time. basis: locality_notice > regional_timetable > unknown (never guessed).
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/components/home/public-data";

export type SupplyBasis = "locality_notice" | "regional_timetable" | "unknown";
/** l locality, d district, r region, f frequency (daily | every_2_days | ""), s/e start/end "HH:MM", u source url, sd source date, b basis. */
export type SupplyRow = { l: string; d: string; r: string; f: string; s: string; e: string; u: string; sd: string; b: SupplyBasis };

export function GET() {
  const rows = parseCsv(readFileSync(path.join(process.cwd(), "data", "supply_rules.csv"), "utf8"));
  const rules: SupplyRow[] = rows.map((x) => ({
    l: x.locality, d: x.district, r: x.region, f: x.frequency, s: x.start_time, e: x.end_time, u: x.source_url, sd: x.source_date,
    b: (["locality_notice", "regional_timetable"].includes(x.basis) ? x.basis : "unknown") as SupplyBasis,
  }));
  return Response.json({ rules, source: "data/supply_rules.csv (P5: CWA communiqués Oct 2026 + island timetable 5 Aug 2026)" });
}

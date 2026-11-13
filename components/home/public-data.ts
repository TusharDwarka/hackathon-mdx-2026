// Public information from P5's real CSVs in data/, read at BUILD time (the pages that use it are
// static, so this runs on the build machine, never in the browser). Every figure keeps its date and source.
// Self-check: npx tsx components/home/public-data.ts
import { existsSync, readFileSync } from "node:fs";
import type { QualityNotice } from "@/components/home/water-day";
import path from "node:path";

/** Header row + comma-separated cells; "double quoted" cells may hold commas.
 *  ponytail: no newlines inside quoted cells, use a CSV library if P5's files ever need them. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const cells: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted && c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') quoted = !quoted;
        else if (c === "," && !quoted) { cells.push(cur); cur = ""; }
        else cur += c;
      }
      return [...cells, cur];
    });
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// ---------- reservoirs ----------

/** The seven reservoirs CWA reports on. A reservoir with no row in the CSVs still shows, as "no verified reading". */
export const RESERVOIRS = ["Mare aux Vacoas", "Midlands Dam", "La Nicolière", "Mare Longue", "Piton du Milieu", "La Ferme", "Bagatelle Dam"];

/** basis: "measured" = the source gives the day of the measurement; "reported" = only the day it was published. */
export type Reading = { name: string; pct: number | null; date: string | null; basis: "measured" | "reported" | null; source_url: string | null; note: string };

const nameKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Latest reading per reservoir. Prior-year comparison rows are history, never "latest". */
export function latestReadings(levels: Record<string, string>[], mav: Record<string, string>[]): { reservoirs: Reading[]; combined: Reading | null } {
  const rows: Reading[] = [
    ...levels
      .filter((r) => r.date_basis !== "prior_year_comparison" && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .map((r): Reading => ({ name: r.reservoir, pct: Number(r.fill_pct), date: r.date, basis: r.date_basis === "data_date" ? "measured" : "reported", source_url: r.source_url || null, note: r.note })),
    ...mav.map((r): Reading => ({ name: r.reservoir, pct: Number(r.level_pct), date: r.day, basis: "reported", source_url: r.source_url || null, note: "" })),
  ].filter((r) => Number.isFinite(r.pct));
  // Newest date wins; on the same day a measured figure beats a published one.
  const latest = (name: string): Reading | undefined =>
    rows
      .filter((r) => nameKey(r.name) === nameKey(name))
      .sort((a, b) => b.date!.localeCompare(a.date!) || (a.basis === "measured" ? -1 : 1))[0];
  return {
    reservoirs: RESERVOIRS.map((name) => {
      const r = latest(name);
      return r ? { ...r, name } : { name, pct: null, date: null, basis: null, source_url: null, note: "" };
    }),
    combined: latest("ALL_7_RESERVOIRS") ?? null,
  };
}

// ---------- news and CWA notices ----------

export type NewsItem = { date: string; title: string; areas: string | null; kind: string; source_url: string };
const KIND: Record<string, string> = { rationing: "Rationing notice", planned_works: "Planned works", alert: "Alert", response: "Response", governance: "Governance" };

/** CWA cut notices + the crisis timeline, newest first. "unrest" rows are left out: they name private people. */
export function newsItems(cuts: Record<string, string>[], timeline: Record<string, string>[]): NewsItem[] {
  return [
    ...cuts.map((r) => ({ date: r.effective_date, title: r.what, areas: r.areas || null, kind: KIND[r.type] ?? r.type, source_url: r.source_url })),
    ...timeline.filter((r) => r.category !== "unrest").map((r) => ({ date: r.date, title: r.event, areas: null, kind: KIND[r.category] ?? r.category, source_url: r.source_url })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- water points and quality notices (P5, docs/WATER-DAY-SPLIT.md): optional files, sourced rows only ----------

export type WaterPoint = { name: string; kind: string; lat: number; lng: number; source_url: string };

export function waterPoints(rows: Record<string, string>[]): WaterPoint[] {
  return rows
    .map((r) => ({ name: r.name, kind: r.kind, lat: Number(r.lat), lng: Number(r.lng), source_url: r.source_url }))
    .filter((p) => p.name && p.source_url && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0); // no source, no point
}

export type PublicData = { reservoirs: Reading[]; combined: Reading | null; news: NewsItem[]; points: WaterPoint[]; quality: QualityNotice[] };

export function publicData(): PublicData {
  const file = (name: string) => path.join(process.cwd(), "data", name);
  const read = (name: string) => parseCsv(readFileSync(file(name), "utf8"));
  const optional = (name: string) => (existsSync(file(name)) ? read(name) : []); // P5 adds these; until then the cards say so
  return {
    ...latestReadings(read("reservoir_levels.csv"), read("reservoir.csv")),
    news: newsItems(read("water_cut_announcements.csv"), read("crisis_timeline.csv")),
    points: waterPoints(optional("water_points.csv")),
    quality: optional("quality_notices.csv").filter((r): r is QualityNotice => !!(r.day && r.title && r.source_url)) as QualityNotice[],
  };
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("public-data.ts")) {
  const csv = parseCsv('a,b,c\n1,"x, y",3\n\n4,"say ""hi""",');
  console.assert(csv.length === 2 && csv[0].b === "x, y" && csv[1].b === 'say "hi"' && csv[1].c === "", "csv");

  const lv = parseCsv(
    "date,date_basis,reservoir,fill_pct,source_url,note\n" +
      "2025-10-08,prior_year_comparison,Mare-aux-Vacoas,87.4,u0,\n" +
      "2026-10-08,article_date,Mare-aux-Vacoas,35.0,u1,\n" +
      "2026-10-08,data_date,Mare-aux-Vacoas,35.7,u2,\n" +
      "2026-07-06,data_date,La Nicoliere,72.8,u3,\n" +
      "2026-10-09,data_date,ALL_7_RESERVOIRS,56.8,u4,"
  );
  const { reservoirs, combined } = latestReadings(lv, parseCsv("reservoir,day,level_pct,source_url\nMare aux Vacoas,2026-09-25,38.5,u5"));
  const mav = reservoirs.find((r) => r.name === "Mare aux Vacoas")!;
  console.assert(mav.pct === 35.7 && mav.basis === "measured", "newest, measured beats published, prior year ignored");
  console.assert(reservoirs.find((r) => r.name === "La Nicolière")?.pct === 72.8, "accents and hyphens match");
  console.assert(reservoirs.find((r) => r.name === "Midlands Dam")?.pct === null, "missing reservoir stays visible");
  console.assert(reservoirs.length === 7 && combined?.pct === 56.8, "combined is separate, not an 8th reservoir");

  const news = newsItems(parseCsv("effective_date,areas,what,type,source_url\n2026-08-05,Moka,cuts,rationing,u"), parseCsv("date,event,category,source_url\n2026-10-09,x,unrest,u\n2026-10-19,borehole,response,u"));
  console.assert(news.length === 2 && news[0].title === "borehole" && news[1].kind === "Rationing notice", "news sorted, unrest left out");

  console.assert(waterPoints(parseCsv("name,kind,lat,lng,source_url\nTank A,static tank,-20.3,57.5,u\nNo source,standpipe,-20.3,57.5,")).length === 1, "unsourced point dropped");

  const real = publicData();
  console.assert(real.reservoirs.length === 7 && real.news.length > 0, "real files load");
  console.log("public-data ok");
}

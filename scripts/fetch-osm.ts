// V5 (docs/SPLIT-V5.md, P3 items 3 + 7). Run once, by hand, never at runtime:
//   npx tsx scripts/fetch-osm.ts
// Reads OpenStreetMap through the Overpass API (main island of Mauritius, the 9 districts) and writes:
//   data/localities.csv     name,kind,district,lat,lng,source   (towns, villages, suburbs, hamlets...)
//   public/places.json      search index {n: name, l: locality, d: district, lat, lng}[] (localities + named streets)
//   public/rivers.geojson   waterway=river|stream as LineStrings {name, waterway}, simplified
// A street's locality = the nearest town / village / suburb / hamlet in the same district.
// Data © OpenStreetMap contributors, ODbL. P5 reviews and commits data/localities.csv.
import { mkdirSync, writeFileSync } from "node:fs";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const TODAY = new Date().toISOString().slice(0, 10);
const SOURCE = `OpenStreetMap contributors (ODbL), Overpass API ${TODAY}`;
const MAIN_ISLAND = "-20.55,57.28,-19.95,57.82"; // south,west,north,east: leaves out Rodrigues and the outer islands
const PLACE_KINDS = ["city", "town", "village", "suburb", "hamlet", "locality"]; // best first
const STREET_LOCALITY_KINDS = new Set(["city", "town", "village", "suburb", "hamlet"]);
const ROADS = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|service|pedestrian";

type El = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> };

async function overpass(query: string): Promise<El[]> {
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "user-agent": "kot-delo-hackathon/0.1 (scripts/fetch-osm.ts)", "content-type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(300_000),
        });
        if (res.ok) return ((await res.json()) as { elements: El[] }).elements;
        console.warn(`${url}: HTTP ${res.status} (try ${attempt})`);
      } catch (e) {
        console.warn(`${url}: ${e instanceof Error ? e.message : e} (try ${attempt})`);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error("every Overpass endpoint failed; try again later");
}

/** One query per district so every element comes right after its district relation. */
function perDistrict(body: string): string {
  return `[out:json][timeout:280][bbox:${MAIN_ISLAND}];
area["ISO3166-1"="MU"][admin_level=2]->.mu;
rel(area.mu)[boundary=administrative][admin_level=4]->.ds;
foreach.ds->.d(.d out tags; .d map_to_area->.a; ${body});`;
}

function groupByDistrict(els: El[]): { district: string; el: El }[] {
  const out: { district: string; el: El }[] = [];
  let district = "";
  for (const el of els) {
    if (el.type === "relation") district = el.tags?.["name:en"]?.replace(/ District$/, "") || el.tags?.name || "";
    else out.push({ district, el });
  }
  return out;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
const csv = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const dist2 = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dx = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return dx * dx + (a.lat - b.lat) ** 2;
};

/** Douglas-Peucker on [lng, lat] points; tolerance in degrees (~1e-4 = 11 m). */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

async function main() {
  console.log("1/3 places per district...");
  const placeEls = groupByDistrict(await overpass(perDistrict(`node(area.a)[place~"^(${PLACE_KINDS.join("|")})$"][name]; out;`)));
  const byKey = new Map<string, { name: string; kind: string; district: string; lat: number; lng: number }>();
  for (const { district, el } of placeEls) {
    const name = el.tags!.name.trim();
    const kind = el.tags!.place;
    const key = `${name.toLowerCase()}|${district}`;
    const prev = byKey.get(key);
    if (!prev || PLACE_KINDS.indexOf(kind) < PLACE_KINDS.indexOf(prev.kind)) {
      byKey.set(key, { name, kind, district, lat: r5(el.lat!), lng: r5(el.lon!) });
    }
  }
  const localities = [...byKey.values()].sort((a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name));
  console.log(`   ${localities.length} localities in ${new Set(localities.map((l) => l.district)).size} districts`);

  console.log("2/3 named streets per district...");
  const streetEls = groupByDistrict(await overpass(perDistrict(`way(area.a)[highway~"^(${ROADS})$"][name]; out tags center;`)));
  const anchors = localities.filter((l) => STREET_LOCALITY_KINDS.has(l.kind));
  const streets = new Map<string, { n: string; l: string; d: string; lat: number; lng: number; k: number }>();
  for (const { district, el } of streetEls) {
    if (!el.center) continue;
    const p = { lat: el.center.lat, lng: el.center.lon };
    const pool = anchors.filter((a) => a.district === district);
    const near = (pool.length ? pool : anchors).reduce((best, a) => (dist2(a, p) < dist2(best, p) ? a : best));
    const n = el.tags!.name.trim();
    const key = `${n.toLowerCase()}|${near.name}|${district}`;
    const s = streets.get(key);
    if (s) { s.lat += p.lat; s.lng += p.lng; s.k++; } // several ways of one street: average their centres
    else streets.set(key, { n, l: near.name, d: district, lat: p.lat, lng: p.lng, k: 1 });
  }
  console.log(`   ${streets.size} named streets (${streetEls.length} OSM ways)`);

  const places = [
    ...localities.map((l) => ({ n: l.name, l: l.name, d: l.district, lat: r4(l.lat), lng: r4(l.lng) })),
    ...[...streets.values()].map((s) => ({ n: s.n, l: s.l, d: s.d, lat: r4(s.lat / s.k), lng: r4(s.lng / s.k) })),
  ];

  console.log("3/3 rivers and streams...");
  const water = await overpass(`[out:json][timeout:280][bbox:${MAIN_ISLAND}];
area["ISO3166-1"="MU"][admin_level=2]->.mu;
way(area.mu)[waterway~"^(river|stream)$"]; out tags geom;`);
  const features = water
    .filter((w) => w.geometry && w.geometry.length > 1)
    .map((w) => ({
      type: "Feature" as const,
      properties: { name: w.tags?.name ?? null, waterway: w.tags!.waterway },
      geometry: {
        type: "LineString" as const,
        coordinates: simplify(w.geometry!.map((g) => [r5(g.lon), r5(g.lat)] as [number, number]), 1e-4),
      },
    }));
  console.log(`   ${features.length} waterways (${features.filter((f) => f.properties.name).length} named)`);

  mkdirSync("public", { recursive: true });
  writeFileSync(
    "data/localities.csv",
    ["name,kind,district,lat,lng,source", ...localities.map((l) => [l.name, l.kind, l.district, l.lat, l.lng, SOURCE].map(csv).join(","))].join("\n") + "\n"
  );
  writeFileSync("public/places.json", JSON.stringify(places));
  writeFileSync("public/rivers.geojson", JSON.stringify({ type: "FeatureCollection", attribution: SOURCE, features }));
  console.log(`Wrote data/localities.csv (${localities.length}), public/places.json (${places.length}), public/rivers.geojson (${features.length}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

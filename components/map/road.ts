// Keep the truck on the road. Uses the public OSRM demo server (OpenStreetMap roads):
// `nearest` snaps a GPS fix to the closest road, `route` gives the driving line to the next stop.
// Any failure (offline, slow, rate limit) falls back to the raw point / a straight line: never blocks a round.
// ponytail: public demo server, about 1 request a second. Host our own OSRM if this leaves the demo.
import { km } from "@/lib/eta";
import type { Stop } from "@/components/map/data";

type Pt = { lat: number; lng: number };
const OSRM = "https://router.project-osrm.org";
/** GPS further than this from any road is left alone (a depot yard, a field track). Tune on a real drive. */
export const SNAP_MAX_M = 60;

async function osrm(path: string): Promise<{ waypoints?: { location: [number, number]; distance: number }[]; routes?: { geometry: { coordinates: [number, number][] } }[] }> {
  const res = await fetch(`${OSRM}${path}`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`osrm ${res.status}`);
  return res.json();
}

/** The closest point on a road, or the fix itself when no road is near or the service does not answer. */
export async function snapToRoad(p: Pt): Promise<Pt> {
  try {
    const w = (await osrm(`/nearest/v1/driving/${p.lng},${p.lat}`)).waypoints?.[0];
    return w && w.distance <= SNAP_MAX_M ? { lat: w.location[1], lng: w.location[0] } : p;
  } catch {
    return p;
  }
}

/** Driving line from `from` to `to`, ending exactly on `to`. Straight line when the service does not answer. */
export async function roadPath(from: Pt, to: Pt): Promise<Pt[]> {
  try {
    const line = (await osrm(`/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)).routes?.[0]?.geometry.coordinates;
    if (line?.length) return [...line.map(([lng, lat]) => ({ lat, lng })), to];
  } catch { /* fall through */ }
  return [from, to];
}

/** Move `metres` along `path` (the points still ahead). Shortens `path` in place and returns the new position. */
export function walk(pos: Pt, path: Pt[], metres: number): Pt {
  let left = metres;
  while (path.length && left > 0) {
    const d = km(pos, path[0]) * 1000;
    if (d <= left) { pos = path.shift()!; left -= d; }
    else { const f = left / d; pos = { lat: pos.lat + (path[0].lat - pos.lat) * f, lng: pos.lng + (path[0].lng - pos.lng) * f }; left = 0; }
  }
  return pos;
}

/**
 * Simulated truck that follows the road to its next unserved stop. Call the returned function once per tick
 * with the distance to cover. Returns null until the first route has loaded, so no off-road point is ever shown.
 */
export function roadSim() {
  let pos: Pt | null = null;
  let path: Pt[] = [];
  let target: number | null = null;
  let loading = false;
  return (stops: Stop[], metres: number): Pt | null => {
    const next = stops.find((s) => !s.served_at) ?? stops[stops.length - 1];
    if (!next) return pos;
    if (target !== next.id) {
      if (!loading) {
        loading = true;
        const from = pos ?? { lat: next.street.lat + 0.004, lng: next.street.lng - 0.004 }; // first start: ~600 m away
        roadPath(from, next.street)
          .then((p) => { pos = p[0]; path = p.slice(1); target = next.id; })
          .finally(() => { loading = false; });
      }
      return pos;
    }
    pos = walk(pos!, path, metres);
    return pos;
  };
}

// Self-check: npx tsx components/map/road.ts
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("road.ts")) {
  const a = { lat: 0, lng: 0 }, b = { lat: 0, lng: 0.001 }, c = { lat: 0, lng: 0.002 }; // ~111 m apart
  const path = [b, c];
  const half = walk(a, path, 55.6);
  console.assert(Math.abs(half.lng - 0.0005) < 0.00001 && path.length === 2, "half a segment: between the points, path kept");
  const past = walk(half, path, 111.2);
  console.assert(Math.abs(past.lng - 0.0015) < 0.00001 && path.length === 1, "crosses a point and drops it");
  const end = walk(past, path, 10_000);
  console.assert(end === c && path.length === 0, "never overshoots the last point");
  console.log("road ok");
}

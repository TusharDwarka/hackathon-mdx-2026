// ETA rule (SPEC): travel at 20 km/h to the next stop + 10 min per stop before mine.
// If the last GPS fix is older than 2 min: stops remaining x 10 min.

type Pt = { lat: number; lng: number };

export function km(a: Pt, b: Pt): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** stopsAway = 1 means my street is the next stop. */
export function etaMinutes(truck: Pt & { recordedAt: number }, nextStop: Pt, stopsAway: number, now = Date.now()): number {
  if (stopsAway <= 0) return 0;
  if (now - truck.recordedAt > 2 * 60_000) return stopsAway * 10;
  return Math.round((km(truck, nextStop) / 20) * 60 + (stopsAway - 1) * 10);
}

// Self-check: npx tsx lib/eta.ts
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("eta.ts")) {
  const t = { lat: 0, lng: 0, recordedAt: 1_000_000 };
  const next = { lat: 0, lng: 0.0899 }; // ~10 km east -> 30 min at 20 km/h
  console.assert(etaMinutes(t, next, 1, 1_000_000) === 30, "fresh, next stop");
  console.assert(etaMinutes(t, next, 3, 1_000_000) === 50, "fresh, 2 stops before mine");
  console.assert(etaMinutes(t, next, 3, 1_000_000 + 3 * 60_000) === 30, "stale GPS fallback");
  console.assert(etaMinutes(t, next, 0) === 0, "served");
  console.log("eta ok");
}

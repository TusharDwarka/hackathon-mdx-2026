// Op 26 GET /api/quality?area_id= | ?locality=   "Is my tap water safe to drink?" (V5).
// official notice > "may be cloudy" (heavy rain in the last 48 h, or reservoir < 20 %) > no advisory found.
// Fixed messages only: never says the water is safe or unsafe to drink.
// Rainfall: Open-Meteo hourly data at the area / locality (cached 1 h; unknown when unreachable).
// Without the database: the real Mare aux Vacoas reading + rainfall, demo: true.
import { computeWaterQuality, currentTier, DEFAULT_RESERVOIR, foldName, mauritiusNow, rainLast48h, waterQuality, type Place, type QualityNotice } from "@/lib/queries";
import places from "@/public/places.json";
import { db, dbError, handle, HttpError } from "../_lib/server";
import { DEMO_MAV_READINGS } from "../_lib/demo";

// Only the reservoir we have a sourced link for; other districts: reservoir level unknown (not a reason).
const DISTRICT_RESERVOIR: Record<string, string> = { "Plaines Wilhems": DEFAULT_RESERVOIR };
const rainCache = new Map<string, { at: number; mm: number | null }>();

async function rainAt(lat: number, lng: number): Promise<number | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = rainCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.mm;
  let mm: number | null = null;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&past_days=2&forecast_days=1&timezone=GMT`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) mm = rainLast48h(((await r.json()) as { hourly?: { time: string[]; precipitation: (number | null)[] } }).hourly);
  } catch (e) {
    console.warn("quality: rainfall unknown:", e instanceof Error ? e.message : e);
  }
  rainCache.set(key, { at: Date.now(), mm });
  return mm;
}

const findLocality = (name: string) => {
  const f = foldName(name);
  return (places as Place[]).find((p) => p.l === p.n && foldName(p.n) === f) ?? null;
};

export const GET = handle(async (req) => {
  const params = new URL(req.url).searchParams;
  const raw = params.get("area_id");
  const areaId = raw === null ? undefined : Number(raw);
  if (areaId !== undefined && (!Number.isSafeInteger(areaId) || areaId <= 0)) throw new HttpError(400, "invalid_area_id");
  const localityName = params.get("locality")?.trim() || null;
  const locality = localityName ? findLocality(localityName) : null;
  if (localityName && !locality) throw new HttpError(404, "unknown_locality");
  const now = mauritiusNow();
  const spot = locality ?? findLocality("Vacoas")!;

  try {
    const client = db();
    if (locality) {
      const reservoir = DISTRICT_RESERVOIR[locality.d] ?? null;
      const [notices, latest, rain] = await Promise.all([
        client.from("quality_notices").select("area,title,day,category,source_url,island_wide"),
        reservoir ? client.from("reservoir_levels").select("day,level_pct,source_url").eq("reservoir", reservoir).order("day", { ascending: false }).limit(1) : null,
        rainAt(locality.lat, locality.lng),
      ]);
      dbError(notices.error);
      if (latest) dbError(latest.error);
      const mine = (notices.data ?? []).filter((n) => n.island_wide || foldName(n.area) === foldName(locality.n)) as QualityNotice[];
      const r = latest?.data?.[0] ?? null;
      return Response.json({
        ...computeWaterQuality(mine, currentTier(r, now), now, { locality: locality.n, levelPct: r?.level_pct ?? null, levelDay: r?.day ?? null, levelSource: r?.source_url ?? null, rainMm48h: rain }),
        demo: false,
      });
    }
    let id = areaId;
    if (id === undefined) {
      const { data, error } = await client.from("areas").select("id").order("id").limit(1);
      dbError(error);
      id = data?.[0]?.id;
    }
    if (id === undefined) throw new Error("no areas loaded");
    const { data: area, error } = await client.from("areas").select("name").eq("id", id).maybeSingle();
    dbError(error);
    const at = findLocality(area?.name ?? "") ?? spot;
    return Response.json({ ...(await waterQuality(id, now, client, { locality: area?.name ?? null, rainMm48h: await rainAt(at.lat, at.lng) })), demo: false });
  } catch (e) {
    console.warn("quality: demo fallback:", e instanceof Error ? e.message : e);
    const r = DEMO_MAV_READINGS[DEMO_MAV_READINGS.length - 1];
    const mav = spot.d === "Plaines Wilhems"; // the demo reading is Mare aux Vacoas: only used for its district
    return Response.json({
      ...computeWaterQuality([], mav ? currentTier(r, now) : null, now, {
        locality: spot.n, levelPct: mav ? r.level_pct : null, levelDay: mav ? r.day : null, rainMm48h: await rainAt(spot.lat, spot.lng),
      }),
      demo: true,
    });
  }
});

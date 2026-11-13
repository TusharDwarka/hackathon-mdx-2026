// Op 26 GET /api/quality?area_id=  official notice > low-reservoir "may be cloudy" > none.
// Fixed messages only: never says the water is safe or unsafe to drink.
// Fallback: the low-reservoir rule on the real Mare aux Vacoas reading (demo: true).
import { computeWaterQuality, currentTier, mauritiusNow, waterQuality } from "@/lib/queries";
import { db, dbError, handle, HttpError } from "../_lib/server";
import { DEMO_MAV_READINGS } from "../_lib/demo";

export const GET = handle(async (req) => {
  const raw = new URL(req.url).searchParams.get("area_id");
  const areaId = raw === null ? undefined : Number(raw);
  if (areaId !== undefined && (!Number.isSafeInteger(areaId) || areaId <= 0)) throw new HttpError(400, "invalid_area_id");
  const now = mauritiusNow();
  try {
    const client = db();
    let id = areaId;
    if (id === undefined) {
      const { data, error } = await client.from("areas").select("id").order("id").limit(1);
      dbError(error);
      id = data?.[0]?.id;
    }
    if (id === undefined) throw new Error("no areas loaded");
    return Response.json({ ...(await waterQuality(id, now, client)), demo: false });
  } catch (e) {
    console.warn("quality: demo fallback:", e instanceof Error ? e.message : e);
    const tier = currentTier(DEMO_MAV_READINGS[DEMO_MAV_READINGS.length - 1], now);
    return Response.json({ ...computeWaterQuality([], tier, now), demo: true });
  }
});

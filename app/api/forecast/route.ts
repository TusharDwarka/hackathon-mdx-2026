// Op 24 GET /api/forecast?area_id=  next water window: official > every second day > history.
// Always an estimate unless basis = "official". Falls back to the real timetable pattern (demo: true).
import { computeForecast, currentTier, forecastNext, mauritiusNow } from "@/lib/queries";
import { db, dbError, handle, HttpError } from "../_lib/server";
import { DEMO_MAV_READINGS, demoSchedule } from "../_lib/demo";

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
    const forecast = await forecastNext(id, now, client);
    return Response.json(forecast && { ...forecast, demo: false });
  } catch (e) {
    console.warn("forecast: demo fallback:", e instanceof Error ? e.message : e);
    const tier = currentTier(DEMO_MAV_READINGS[DEMO_MAV_READINGS.length - 1], now);
    const forecast = computeForecast(demoSchedule(), tier, null, now);
    return Response.json(forecast && { ...forecast, demo: true });
  }
});

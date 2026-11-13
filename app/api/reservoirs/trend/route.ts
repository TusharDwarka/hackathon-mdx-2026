// Op 25 GET /api/reservoirs/trend?reservoir=  least-squares trend + 30-day projection (an estimate).
// Default reservoir: Mare aux Vacoas. reservoir=all -> { trends: Trend[] } for every single reservoir.
// Falls back to the real Mare aux Vacoas readings from data/reservoir.csv (demo: true).
import { DEFAULT_RESERVOIR, mauritiusNow, reservoirTrend, reservoirTrends } from "@/lib/queries";
import { db, handle, HttpError } from "../../_lib/server";
import { DEMO_MAV_READINGS } from "../../_lib/demo";

export const GET = handle(async (req) => {
  const name = (new URL(req.url).searchParams.get("reservoir") ?? DEFAULT_RESERVOIR).trim();
  if (!name || name.length > 100) throw new HttpError(400, "invalid_reservoir");
  const all = name.toLowerCase() === "all";
  const now = mauritiusNow();
  try {
    const trends = await reservoirTrends(all ? undefined : name, now, db());
    if (all) return Response.json({ trends, demo: false });
    return Response.json(trends[0] ? { ...trends[0], demo: false } : null);
  } catch (e) {
    console.warn("trend: demo fallback:", e instanceof Error ? e.message : e);
    const demo = reservoirTrend(DEMO_MAV_READINGS, now, DEFAULT_RESERVOIR);
    if (all) return Response.json({ trends: demo ? [demo] : [], demo: true });
    return Response.json(demo && name === DEFAULT_RESERVOIR ? { ...demo, demo: true } : null);
  }
});

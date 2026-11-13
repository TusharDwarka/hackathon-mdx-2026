// GET: latest reading of every reservoir (current / stale / missing) + the all-reservoir aggregate.
import { latestReservoirs, type ReservoirReading } from "@/lib/queries";
import { db, dbError, handle } from "../_lib/server";

export const GET = handle(async () => {
  const { data, error } = await db().from("reservoir_levels").select("reservoir,day,level_pct,source_url,date_basis,is_aggregate");
  dbError(error);
  return Response.json({
    ...latestReservoirs((data ?? []) as ReservoirReading[]),
    thresholds:
      "DEMO thresholds: 60% or more normal, 30 to 60% watch, under 30% critical. A reservoir level never says whether tap water is safe to drink.",
  });
});

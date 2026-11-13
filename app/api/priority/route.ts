// GET: priority list (op 17) with waiting litres and plain-word reasons; unknown dryness stays null.
import { computeHoursDry, priorityRows } from "@/lib/queries";
import { db, dbError, handle } from "../_lib/server";

export const GET = handle(async () => {
  const client = db();
  const [streets, waterOn, waiting] = await Promise.all([
    client.from("streets").select("id,name,order_index").order("order_index"),
    client.from("reports").select("street_id,created_at").eq("type", "water_on").order("created_at", { ascending: false }).limit(5000),
    client.from("requests").select("street_id,litres").eq("status", "waiting"),
  ]);
  for (const r of [streets, waterOn, waiting]) dbError(r.error);
  const list = streets.data ?? [];
  const hours = computeHoursDry(list.map((s) => s.id), waterOn.data ?? []);
  return Response.json({ rows: priorityRows(list, hours, waiting.data ?? []) });
});

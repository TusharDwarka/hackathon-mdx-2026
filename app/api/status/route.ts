// GET: water status with trust for every street (op 15, V3 rule computeAllStreetTrust).
// Public. Uses the private session links so repeats from one session count once; session ids
// never leave the server (only counts and reason codes are returned).
import { computeAllStreetTrust, type ReportType } from "@/lib/queries";
import { db, dbError, handle } from "../_lib/server";

const WINDOW_H = 3;

export const GET = handle(async () => {
  const client = db();
  const since = new Date(Date.now() - WINDOW_H * 3_600_000).toISOString();
  const [streets, reports] = await Promise.all([
    client.from("streets").select("id,order_index"),
    client.from("reports").select("id,street_id,type,created_at").gte("created_at", since).order("created_at"),
  ]);
  dbError(streets.error);
  dbError(reports.error);
  const ids = (reports.data ?? []).map((r) => r.id);
  const links = ids.length
    ? await client.from("session_actions").select("ref_id,session_id").eq("kind", "report").in("ref_id", ids)
    : { data: [], error: null };
  dbError(links.error);
  const sourceOf = new Map((links.data ?? []).map((l) => [l.ref_id, l.session_id as string]));
  const statuses = computeAllStreetTrust(
    streets.data ?? [],
    (reports.data ?? []).map((r) => ({ street_id: r.street_id, type: r.type as ReportType, created_at: r.created_at, source: sourceOf.get(r.id) ?? null }))
  );
  return Response.json({ window_hours: WINDOW_H, statuses });
});

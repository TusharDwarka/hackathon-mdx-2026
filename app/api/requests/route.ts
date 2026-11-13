// POST {street_id}: "I need a tanker" (op 3, V5: one household, no litres; a litres field is ignored).
// A repeat returns the same request.
// GET: this session's own requests with delivery progress (allocated / delivered litres).
import { validateRequestInput, type MyRequest } from "@/lib/queries";
import { db, dbError, handle, readJson, requireSession, rpc, valid } from "../_lib/server";

export const POST = handle(async (req) => {
  const s = await requireSession();
  const v = valid(validateRequestInput(await readJson(req)));
  const r = await rpc("kd_guest_request", { p_session: s.id, p_street: v.street_id, p_litres: null });
  return Response.json({ id: r.id, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
});

export const GET = handle(async () => {
  const s = await requireSession();
  const client = db();
  const { data: acts, error } = await client.from("session_actions").select("ref_id").eq("session_id", s.id).eq("kind", "request");
  dbError(error);
  const ids = (acts ?? []).map((a) => a.ref_id);
  if (!ids.length) return Response.json({ requests: [] });
  const [reqs, allocs] = await Promise.all([
    client.from("requests").select("id,street_id,litres,status,created_at").in("id", ids).order("created_at", { ascending: false }),
    client.from("allocations").select("request_id,litres,delivered_at").in("request_id", ids).is("released_at", null),
  ]);
  dbError(reqs.error);
  dbError(allocs.error);
  const requests: MyRequest[] = (reqs.data ?? []).map((r) => {
    const mine = (allocs.data ?? []).filter((a) => a.request_id === r.id);
    return {
      ...r,
      allocated_litres: mine.reduce((sum, a) => sum + a.litres, 0),
      delivered_litres: mine.filter((a) => a.delivered_at).reduce((sum, a) => sum + a.litres, 0),
    };
  });
  return Response.json({ requests });
});

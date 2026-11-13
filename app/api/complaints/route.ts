// GET ?status=open|all: complaints grouped by category + area + status (everyone); the individual
//   records too for an ops session (never user_id). GET ?mine=1 + Bearer token: the user's own.
// POST {street_id, category} + Bearer token: a signed-in user files one (op 14, V5).
//   A guest gets 401 sign_in_required. PATCH {id, status: 'resolved'|'open'}: ops only.
import { groupComplaints, validateComplaintInput, type Complaint } from "@/lib/queries";
import { currentSession, db, dbError, handle, HttpError, readJson, requireSession, requireUser, rpc, valid } from "../_lib/server";

export const GET = handle(async (req) => {
  const params = new URL(req.url).searchParams;
  if (params.get("mine") === "1") {
    const user = await requireUser(req);
    const { data, error } = await db().from("complaints").select("id,street_id,category,created_at,status")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    dbError(error);
    return Response.json({ records: (data ?? []) as Complaint[] });
  }
  const status = params.get("status") ?? "open";
  if (status !== "open" && status !== "all") throw new HttpError(400, "invalid_status");
  const client = db();
  let q = client.from("complaints").select("id,street_id,category,created_at,status").order("created_at", { ascending: false }).limit(500);
  if (status === "open") q = q.eq("status", "open");
  const [{ data, error }, streets, session] = await Promise.all([q, client.from("streets").select("id,area_id"), currentSession()]);
  dbError(error);
  dbError(streets.error);
  const complaints = (data ?? []) as Complaint[];
  const streetArea = Object.fromEntries((streets.data ?? []).map((s) => [s.id, s.area_id]));
  return Response.json({
    groups: groupComplaints(complaints, streetArea),
    ...(session?.role === "ops" ? { records: complaints } : {}),
  });
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const v = valid(validateComplaintInput(await readJson(req)));
  const r = await rpc("kd_user_complaint", { p_user: user.id, p_street: v.street_id, p_category: v.category });
  return Response.json({ id: r.id, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201 });
});

export const PATCH = handle(async (req) => {
  await requireSession("ops");
  const b = (await readJson(req)) as Record<string, unknown> | null;
  const id = b?.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "invalid_id");
  const status = b?.status ?? "resolved";
  if (status !== "resolved" && status !== "open") throw new HttpError(400, "invalid_status");
  const { data, error } = await db().from("complaints").update({ status }).eq("id", id).select("id,status").maybeSingle();
  dbError(error);
  if (!data) throw new HttpError(404, "unknown_complaint");
  return Response.json(data);
});

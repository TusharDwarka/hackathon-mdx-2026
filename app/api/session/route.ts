// GET current session · POST start one (guest / driver + tanker + code / ops + code) · DELETE end it.
// Public pages need no session. A guest session is needed to report, request water or complain.
import { checkAccessCode, createSession, currentSession, db, dbError, deleteSession, handle, HttpError, readJson, sessionInfo } from "../_lib/server";

export const GET = handle(async () => Response.json(sessionInfo(await currentSession())));

export const POST = handle(async (req) => {
  const b = (await readJson(req)) as Record<string, unknown> | null;
  const role = b?.role;
  if (role === "guest") {
    const cur = await currentSession();
    if (cur) return Response.json(sessionInfo(cur)); // double click / second tab: reuse, no new session
    return Response.json(sessionInfo(await createSession("guest", null)), { status: 201 });
  }
  if (role === "driver" || role === "ops") {
    const { demo } = checkAccessCode(role, b?.code);
    let tankerId: number | null = null;
    if (role === "driver") {
      const t = b?.tanker_id;
      if (typeof t !== "number" || !Number.isSafeInteger(t) || t <= 0) throw new HttpError(400, "invalid_tanker_id");
      const { data, error } = await db().from("tankers").select("id").eq("id", t).eq("active", true).maybeSingle();
      dbError(error);
      if (!data) throw new HttpError(400, "unknown_tanker");
      tankerId = t;
    }
    await deleteSession(); // a role change replaces the old session
    return Response.json(sessionInfo(await createSession(role, tankerId), demo), { status: 201 });
  }
  throw new HttpError(400, "invalid_role");
});

export const DELETE = handle(async () => {
  await deleteSession();
  return Response.json({ ok: true });
});

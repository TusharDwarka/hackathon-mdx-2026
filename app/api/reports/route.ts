// POST {street_id, type}: one-tap report (op 2) by a session. Limits in sql/v3.sql kd_guest_report.
import { validateReportInput } from "@/lib/queries";
import { handle, readJson, requireSession, rpc, valid } from "../_lib/server";

export const POST = handle(async (req) => {
  const s = await requireSession();
  const v = valid(validateReportInput(await readJson(req)));
  const r = await rpc("kd_guest_report", { p_session: s.id, p_street: v.street_id, p_type: v.type });
  return Response.json({ id: r.id }, { status: 201 });
});

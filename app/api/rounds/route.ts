// GET: a driver session sees ONLY its own tanker's open round; everyone else sees open rounds
//   (optionally ?street_id= to follow the tanker coming to that street). Street-level data only.
// POST {action}: driver -> start | serve {round_stop_id} | end {round_id} | position {round_id, lat, lng};
//   ops -> cancel {round_id}. Ownership is checked again inside the sql/v3.sql functions.
import { validatePositionInput } from "@/lib/queries";
import { currentSession, handle, HttpError, readJson, requireSession, rpc, valid } from "../_lib/server";
import { roundView, roundViews } from "../_lib/rounds";

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

export const GET = handle(async (req) => {
  const s = await currentSession();
  if (s?.role === "driver") return Response.json({ role: s.role, rounds: await roundViews({ tankerId: s.tanker_id! }) });
  const raw = new URL(req.url).searchParams.get("street_id");
  const streetId = raw === null ? undefined : Number(raw);
  if (streetId !== undefined && !isId(streetId)) throw new HttpError(400, "invalid_street_id");
  return Response.json({ role: s?.role ?? null, rounds: await roundViews({ streetId }) });
});

export const POST = handle(async (req) => {
  const b = (await readJson(req)) as Record<string, unknown> | null;
  const action = b?.action;

  if (action === "cancel") {
    await requireSession("ops");
    if (!isId(b?.round_id)) throw new HttpError(400, "invalid_round_id");
    return Response.json(await rpc("kd_end_round", { p_tanker: null, p_round: b.round_id }));
  }

  const s = await requireSession("driver");
  const tanker = s.tanker_id!;
  switch (action) {
    case "start": {
      const r = await rpc("kd_start_round", { p_tanker: tanker });
      return Response.json({ ...r, round: await roundView(Number(r.round_id)) });
    }
    case "serve": {
      if (!isId(b?.round_stop_id)) throw new HttpError(400, "invalid_round_stop_id");
      return Response.json(await rpc("kd_serve_stop", { p_tanker: tanker, p_stop: b.round_stop_id }));
    }
    case "end": {
      if (!isId(b?.round_id)) throw new HttpError(400, "invalid_round_id");
      return Response.json(await rpc("kd_end_round", { p_tanker: tanker, p_round: b.round_id }));
    }
    case "position": {
      const v = valid(validatePositionInput(b));
      return Response.json(await rpc("kd_post_position", { p_tanker: tanker, p_round: v.round_id, p_lat: v.lat, p_lng: v.lng }));
    }
    default:
      throw new HttpError(400, "invalid_action");
  }
});

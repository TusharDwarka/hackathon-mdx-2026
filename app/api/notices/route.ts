// GET ?area_id=: official notices / advisories (active, upcoming, expired count) with source and
// validity, plus locality supply volumes (m3, with their period). Unmatched localities are listed,
// never placed on a guessed area.
import { classifyNotices, type Notice, type SupplyVolume } from "@/lib/queries";
import { db, dbError, handle, HttpError } from "../_lib/server";

export const GET = handle(async (req) => {
  const raw = new URL(req.url).searchParams.get("area_id");
  const areaId = raw === null ? undefined : Number(raw);
  if (areaId !== undefined && (!Number.isSafeInteger(areaId) || areaId <= 0)) throw new HttpError(400, "invalid_area_id");
  const client = db();
  let nq = client.from("notices").select("id,kind,topic,locality,area_id,starts_at,ends_at,title,source_url,source_date").order("source_date", { ascending: false });
  let sq = client.from("supply_volumes").select("locality,area_id,volume_m3,period_start,period_end,source_url").order("period_end", { ascending: false });
  if (areaId !== undefined) {
    nq = nq.eq("area_id", areaId);
    sq = sq.eq("area_id", areaId);
  }
  const [notices, supply, unmapped] = await Promise.all([
    nq,
    sq,
    client.from("notices").select("locality").is("area_id", null),
  ]);
  for (const r of [notices, supply, unmapped]) dbError(r.error);
  return Response.json({
    ...classifyNotices((notices.data ?? []) as Notice[]),
    supply: (supply.data ?? []) as SupplyVolume[],
    unmapped_localities: [...new Set((unmapped.data ?? []).map((n) => n.locality))],
  });
});

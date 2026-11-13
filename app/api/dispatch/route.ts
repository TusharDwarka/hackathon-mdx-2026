// Ops only.
// GET ?capacity=&tankers=&max_trips=&split=  preview from live outstanding demand (planDispatch).
//   Defaults: capacity = smallest free tanker, tankers = free tankers, max_trips = 1, split = true.
//   Overrides are "what if" (e.g. capacity=100&tankers=1 shows the 120 L / 100 L two-load case).
// POST {tanker_id, dispatch_key, split?}  put ONE load on that tanker (kd_allocate_load):
//   street order, never above capacity, same dispatch_key -> same round, busy tanker refused.
import { planDispatch, type DemandItem, type Tanker } from "@/lib/queries";
import { db, dbError, handle, HttpError, readJson, requireSession, rpc } from "../_lib/server";
import { roundView } from "../_lib/rounds";

function intParam(url: URL, key: string, min: number): number | undefined {
  const v = url.searchParams.get(key);
  if (v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > 1_000_000) throw new HttpError(400, `invalid_${key}`);
  return n;
}

export const GET = handle(async (req) => {
  await requireSession("ops");
  const url = new URL(req.url);
  const client = db();
  const [reqs, streets, tankersRes, open] = await Promise.all([
    client.from("requests").select("id,street_id,litres,created_at").eq("status", "waiting"),
    client.from("streets").select("id,order_index"),
    client.from("tankers").select("id,name,capacity_litres,active").order("id"),
    client.from("rounds").select("tanker_id").in("status", ["planned", "active"]),
  ]);
  for (const r of [reqs, streets, tankersRes, open]) dbError(r.error);
  const waiting = reqs.data ?? [];
  const ids = waiting.map((r) => r.id);
  const allocs = ids.length
    ? await client.from("allocations").select("request_id,litres").in("request_id", ids).is("released_at", null)
    : { data: [], error: null };
  dbError(allocs.error);

  const allocated: Record<number, number> = {};
  for (const a of allocs.data ?? []) allocated[a.request_id] = (allocated[a.request_id] ?? 0) + a.litres;
  const order = Object.fromEntries((streets.data ?? []).map((s) => [s.id, s.order_index]));
  const demand: DemandItem[] = waiting
    .filter((r) => r.litres !== null)
    .map((r) => ({ request_id: r.id, street_id: r.street_id, order_index: order[r.street_id] ?? 0, created_at: r.created_at, litres: r.litres! - (allocated[r.id] ?? 0) }))
    .filter((d) => d.litres > 0);

  const busy = new Set((open.data ?? []).map((r) => r.tanker_id));
  const tankers = ((tankersRes.data ?? []) as Tanker[]).map((t) => ({ ...t, busy: busy.has(t.id) }));
  const free = tankers.filter((t) => t.active && !t.busy);
  const pool = free.length ? free : tankers.filter((t) => t.active);
  const capacity = intParam(url, "capacity", 1) ?? (pool.length ? Math.min(...pool.map((t) => t.capacity_litres)) : undefined);
  if (capacity === undefined) throw new HttpError(409, "no_tankers");
  const split = url.searchParams.get("split") !== "false";

  const plan = planDispatch(demand, {
    capacityLitres: capacity,
    tankers: intParam(url, "tankers", 0) ?? free.length,
    maxTripsPerTanker: intParam(url, "max_trips", 1) ?? 1,
    split,
  });
  if (new Set(pool.map((t) => t.capacity_litres)).size > 1 && url.searchParams.get("capacity") === null) {
    plan.assumptions.unshift(`Tankers have different capacities; this preview uses the smallest (${capacity} L). The real load uses each tanker's own capacity.`);
  }
  return Response.json({ plan, tankers, requests_without_litres: waiting.filter((r) => r.litres === null).length });
});

export const POST = handle(async (req) => {
  await requireSession("ops");
  const b = (await readJson(req)) as Record<string, unknown> | null;
  const tankerId = b?.tanker_id;
  if (typeof tankerId !== "number" || !Number.isSafeInteger(tankerId) || tankerId <= 0) throw new HttpError(400, "invalid_tanker_id");
  const key = b?.dispatch_key;
  if (typeof key !== "string" || key.length < 8 || key.length > 100) throw new HttpError(400, "invalid_dispatch_key");
  const r = await rpc("kd_allocate_load", { p_tanker: tankerId, p_key: key, p_split: b?.split !== false });
  const roundId = Number(r.round_id);
  return Response.json({ ...r, round_id: roundId, round: await roundView(roundId) }, { status: r.duplicate ? 200 : 201 });
});

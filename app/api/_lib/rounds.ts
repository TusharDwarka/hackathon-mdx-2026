// Server read: open rounds with their tanker, stops (street-level only) and litres per stop.
import type { RoundView } from "@/lib/queries";
import { db, dbError } from "./server";

type Filter = { tankerId?: number; streetId?: number; ids?: number[] };

export async function roundViews(f: Filter): Promise<RoundView[]> {
  const client = db();
  let q = client.from("rounds").select("id,status,started_at,tanker_id").order("started_at");
  q = f.ids ? q.in("id", f.ids) : q.in("status", ["planned", "active"]);
  if (f.tankerId !== undefined) q = q.eq("tanker_id", f.tankerId);
  const { data: rounds, error } = await q;
  dbError(error);
  if (!rounds?.length) return [];
  const ids = rounds.map((r) => r.id);
  const [stops, allocs, tankers] = await Promise.all([
    client.from("round_stops").select("id,round_id,street_id,stop_order,served_at,street:streets(name)").in("round_id", ids).order("stop_order"),
    client.from("allocations").select("round_stop_id,litres").in("round_id", ids).is("released_at", null),
    client.from("tankers").select("id,name,capacity_litres"),
  ]);
  dbError(stops.error);
  dbError(allocs.error);
  dbError(tankers.error);
  const litresByStop: Record<number, number> = {};
  for (const a of allocs.data ?? []) litresByStop[a.round_stop_id] = (litresByStop[a.round_stop_id] ?? 0) + a.litres;
  const tankerById = new Map((tankers.data ?? []).map((t) => [t.id, t]));
  const views = rounds.map((r): RoundView => {
    const own = (stops.data ?? []).filter((s) => s.round_id === r.id);
    const stopViews = own.map((s) => {
      const street = s.street as unknown as { name: string } | { name: string }[] | null;
      const name = Array.isArray(street) ? street[0]?.name : street?.name;
      return { id: s.id, street_id: s.street_id, street_name: name ?? "", stop_order: s.stop_order, served_at: s.served_at, litres: litresByStop[s.id] ?? 0 };
    });
    return {
      id: r.id,
      status: r.status,
      started_at: r.started_at,
      tanker: r.tanker_id ? tankerById.get(r.tanker_id) ?? null : null,
      litres: stopViews.reduce((sum, s) => sum + s.litres, 0),
      stops: stopViews,
    };
  });
  return f.streetId === undefined ? views : views.filter((v) => v.stops.some((s) => s.street_id === f.streetId));
}

export async function roundView(id: number): Promise<RoundView | null> {
  return (await roundViews({ ids: [id] }))[0] ?? null;
}

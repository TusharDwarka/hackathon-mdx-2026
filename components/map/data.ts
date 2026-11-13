// Shared Supabase reads for /driver and /map (contracts/api.md ops 4-9).
// Browser-side, anon key: RLS in sql/schema.sql decides what is allowed.
import { supabase } from "@/lib/supabase";

export type Street = { id: number; name: string; lat: number; lng: number; order_index: number };
export type Round = { id: number; status: "active" | "done"; started_at: string };
export type Stop = { id: number; round_id: number; street_id: number; stop_order: number; served_at: string | null; street: Street };
export type Fix = { lat: number; lng: number; recorded_at: string };

const STREET_COLS = "id,name,lat,lng,order_index";
const byOrder = (a: Street, b: Street) => a.order_index - b.order_index;

export async function loadStreets(): Promise<Street[]> {
  const { data, error } = await supabase.from("streets").select(STREET_COLS).order("order_index");
  if (error) throw error;
  return (data ?? []) as Street[];
}

/** Distinct streets that have at least one 'waiting' request, in route order. */
export async function loadWaitingStreets(): Promise<Street[]> {
  const { data, error } = await supabase.from("requests").select(`street_id, street:streets(${STREET_COLS})`).eq("status", "waiting");
  if (error) throw error;
  const seen = new Map<number, Street>();
  for (const r of (data ?? []) as unknown as { street_id: number; street: Street | null }[]) {
    if (r.street && !seen.has(r.street_id)) seen.set(r.street_id, r.street);
  }
  return [...seen.values()].sort(byOrder);
}

export async function loadStops(roundId: number): Promise<Stop[]> {
  const { data, error } = await supabase
    .from("round_stops")
    .select(`id,round_id,street_id,stop_order,served_at, street:streets(${STREET_COLS})`)
    .eq("round_id", roundId)
    .order("stop_order");
  if (error) throw error;
  return (data ?? []) as unknown as Stop[];
}

/** The newest active round with its stops, or null when no tanker is out. */
export async function loadActiveRound(): Promise<{ round: Round; stops: Stop[] } | null> {
  const { data, error } = await supabase
    .from("rounds")
    .select("id,status,started_at")
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const round = data as Round;
  return { round, stops: await loadStops(round.id) };
}

/** Op 8: latest GPS fix of a round. */
export async function loadLatestFix(roundId: number): Promise<Fix | null> {
  const { data, error } = await supabase
    .from("truck_positions")
    .select("lat,lng,recorded_at")
    .eq("round_id", roundId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Fix | null) ?? null;
}

"use client";

// Driver screen (contracts/api.md ops 4-7). No login: anyone can open it.
// Start round -> rounds + round_stops. While active: watchPosition, one
// truck_positions insert every 5s, screen Wake Lock. Served -> round_stops +
// requests. End round -> rounds.status 'done' and tracking stops.
// Fallbacks: no waiting requests -> all streets; no GPS -> simulated drive;
// Supabase unreachable -> local demo mode (nothing is saved).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { MOCK_STREETS } from "@/lib/mock";
import { loadActiveRound, loadStreets, loadWaitingStreets, type Round, type Stop, type Street } from "@/components/map/data";

const SEND_EVERY_MS = 5000;
type Gps = "waiting" | "live" | "blocked" | "sim";

export default function DriverPage() {
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState<string | null>(null); // Supabase error text -> demo mode
  const [waiting, setWaiting] = useState<Street[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [gps, setGps] = useState<Gps>(() => (typeof navigator !== "undefined" && !("geolocation" in navigator) ? "blocked" : "waiting"));
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [now, setNow] = useState(0); // ticks every second so "sent Xs ago" moves
  const fixRef = useRef<{ lat: number; lng: number } | null>(null);
  const stopsRef = useRef<Stop[]>([]); // the 5s timer reads stops without restarting
  useEffect(() => { stopsRef.current = stops; }, [stops]);

  // Load: resume an active round, otherwise count streets with waiting requests.
  function refresh() {
    return loadActiveRound()
      .then(async (active) => {
        if (active) {
          setRound(active.round);
          setStops(active.stops);
        } else {
          setRound(null);
          setStops([]);
          setWaiting(await loadWaitingStreets());
        }
        setOffline(null);
      })
      .catch((e) => {
        setOffline(e instanceof Error ? e.message : String(e));
        setWaiting(MOCK_STREETS);
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => { refresh(); }, []);

  // Op 4: create the round and its stops (streets with waiting requests, route order).
  async function startRound() {
    setLoading(true);
    try {
      let streets = waiting;
      if (!offline && streets.length === 0) streets = await loadStreets(); // demo fallback: visit every street
      if (offline) {
        const r = { id: -Date.now(), status: "active" as const, started_at: new Date().toISOString() };
        setRound(r);
        setStops(streets.map((s, i) => ({ id: -i - 1, round_id: r.id, street_id: s.id, stop_order: i + 1, served_at: null, street: s })));
        return;
      }
      const { data: r, error } = await supabase.from("rounds").insert({}).select("id,status,started_at").single();
      if (error) throw error;
      const { data: rs, error: e2 } = await supabase
        .from("round_stops")
        .insert(streets.map((s, i) => ({ round_id: r.id, street_id: s.id, stop_order: i + 1 })))
        .select("id,round_id,street_id,stop_order,served_at");
      if (e2) throw e2;
      const byId = new Map(streets.map((s) => [s.id, s]));
      setRound(r as Round);
      setStops((rs ?? []).map((x) => ({ ...x, street: byId.get(x.street_id)! })).sort((a, b) => a.stop_order - b.stop_order));
    } catch (e) {
      setOffline(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Op 6: mark a stop served; its street's waiting requests become 'served'.
  async function serve(stop: Stop) {
    const served_at = new Date().toISOString();
    setStops((prev) => prev.map((s) => (s.id === stop.id ? { ...s, served_at } : s)));
    if (offline) return;
    const { error } = await supabase.from("round_stops").update({ served_at }).eq("id", stop.id);
    if (error) return setOffline(error.message);
    await supabase.from("requests").update({ status: "served" }).eq("street_id", stop.street_id).eq("status", "waiting");
  }

  // Op 7: close the round. The tracking effect below stops because round becomes null.
  async function endRound() {
    if (!round) return;
    if (!offline) {
      const { error } = await supabase.from("rounds").update({ status: "done", ended_at: new Date().toISOString() }).eq("id", round.id);
      if (error) return setOffline(error.message);
    }
    setRound(null);
    setStops([]);
    setGps("waiting");
    setLastSent(null);
    if (!offline) { setLoading(true); refresh(); }
  }

  // Op 5: while a round is active, send the latest GPS fix every 5s and keep the screen on.
  const roundId = round?.id ?? null;
  useEffect(() => {
    if (roundId === null) return;
    let watchId: number | null = null;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const lock = async () => {
      try { sentinel = (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* not supported or denied: fine */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") lock(); };
    lock();
    document.addEventListener("visibilitychange", onVisible);

    if (gps !== "sim" && "geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (p) => { fixRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; setGps("live"); },
        () => setGps((g) => (g === "sim" ? g : "blocked")),
        { enableHighAccuracy: true, maximumAge: SEND_EVERY_MS }
      );
    }

    const timer = setInterval(async () => {
      if (gps === "sim") fixRef.current = simulateStep(fixRef.current, stopsRef.current);
      const fix = fixRef.current;
      if (!fix || cancelled) return;
      if (!offline && roundId > 0) {
        const { error } = await supabase.from("truck_positions").insert({ round_id: roundId, lat: fix.lat, lng: fix.lng });
        if (error) return setOffline(error.message);
      }
      setLastSent(Date.now());
    }, SEND_EVERY_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [roundId, gps, offline]);

  const remaining = stops.filter((s) => !s.served_at).length;
  const ago = lastSent && now ? Math.max(0, Math.round((now - lastSent) / 1000)) : null;

  return (
    <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 p-4">
      {offline && (
        <p className="rounded bg-yellow-100 px-2 py-1 text-center text-xs text-yellow-900">
          Demo mode: database not reachable, nothing is saved. ({offline})
        </p>
      )}
      <h1 className="text-2xl font-bold">Tanker driver</h1>

      {!round ? (
        <>
          <Button className="h-16 text-lg" disabled={loading} onClick={startRound}>
            {loading ? "Loading…" : `Start round · ${waiting.length} stop${waiting.length === 1 ? "" : "s"}`}
          </Button>
          {!loading && waiting.length === 0 && (
            <p className="text-center text-sm text-zinc-500">No waiting requests yet. Starting now visits every street (demo).</p>
          )}
        </>
      ) : (
        <>
          <p className={`text-sm ${gps === "blocked" ? "text-red-700" : "text-emerald-700"}`}>
            {gps === "live" && `● Sharing location (only during the round)${ago !== null ? ` · sent ${ago}s ago` : ""}`}
            {gps === "sim" && `● Simulated drive (demo)${ago !== null ? ` · sent ${ago}s ago` : ""}`}
            {gps === "waiting" && "● Waiting for GPS… allow location when asked"}
            {gps === "blocked" && "● GPS blocked or unavailable. Needs https on a phone."}
          </p>
          {gps !== "sim" && (
            <button type="button" className="self-start text-xs text-zinc-500 underline" onClick={() => { fixRef.current = null; setGps("sim"); }}>
              No GPS here? Simulate the drive
            </button>
          )}
          <ol className="flex flex-col gap-2">
            {stops.map((s) => {
              const done = !!s.served_at;
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="w-6 text-center font-bold">{s.stop_order}</span>
                  <span className={`flex-1 ${done ? "text-zinc-400 line-through" : ""}`}>{s.street.name}</span>
                  <Button className="h-12" variant={done ? "outline" : "default"} disabled={done} onClick={() => serve(s)}>
                    {done ? "Served ✓" : "Served"}
                  </Button>
                </li>
              );
            })}
          </ol>
          <Button className="h-14" variant="destructive" onClick={endRound}>
            End round{remaining > 0 ? ` (${remaining} left)` : ""}
          </Button>
        </>
      )}
      <Link href="/" className="text-center text-sm text-zinc-500">Home</Link>
    </main>
  );
}

// Demo fallback when the device has no GPS: glide toward the next unserved stop.
function simulateStep(pos: { lat: number; lng: number } | null, stops: Stop[]) {
  const next = stops.find((s) => !s.served_at)?.street ?? stops[stops.length - 1]?.street;
  if (!next) return pos;
  if (!pos) return { lat: next.lat + 0.004, lng: next.lng - 0.004 }; // start ~600 m away
  return { lat: pos.lat + (next.lat - pos.lat) * 0.25, lng: pos.lng + (next.lng - pos.lng) * 0.25 };
}

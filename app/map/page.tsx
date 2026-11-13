"use client";

// Resident map (contracts/api.md ops 8-9). Truck marker moves on Realtime
// inserts to truck_positions; "N stops away, about X min" from lib/eta.ts;
// status flips to Served when the driver marks my stop.
// My street: ?street=<id>, else localStorage "kot-delo:street_id", else first street.
// Fallback: Supabase unreachable -> simulated truck over the mock streets.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { etaMinutes } from "@/lib/eta";
import { MOCK_STREETS } from "@/lib/mock";
import { TruckMap } from "@/components/map/TruckMap";
import { loadActiveRound, loadLatestFix, loadStreets, type Fix, type Round, type Stop, type Street } from "@/components/map/data";

const STREET_KEY = "kot-delo:street_id";

export default function MapPage() {
  const [streets, setStreets] = useState<Street[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const stopsRef = useRef<Stop[]>([]); // for the demo timer
  useEffect(() => { stopsRef.current = stops; }, [stops]);

  // Initial load: streets, my street, active round, latest fix.
  useEffect(() => {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("street"));
    let stored = 0;
    try { stored = Number(localStorage.getItem(STREET_KEY)); } catch { /* private mode */ }
    Promise.all([loadStreets(), loadActiveRound()])
      .then(async ([ss, active]) => {
        setStreets(ss);
        setMyId(fromUrl || stored || ss[0]?.id || null);
        setRound(active?.round ?? null);
        setStops(active?.stops ?? []);
        setFix(active ? await loadLatestFix(active.round.id) : null);
        setOffline(null);
      })
      .catch((e) => {
        setOffline(e instanceof Error ? e.message : String(e));
        setStreets(MOCK_STREETS);
        setMyId(fromUrl || stored || MOCK_STREETS[2].id);
        setRound({ id: -1, status: "active", started_at: new Date().toISOString() });
        setStops(MOCK_STREETS.map((s, i) => ({ id: -i - 1, round_id: -1, street_id: s.id, stop_order: i + 1, served_at: null, street: s })));
      })
      .finally(() => setLoading(false));
    const clock = setInterval(() => setNow(Date.now()), 5000); // ETA staleness check
    return () => clearInterval(clock);
  }, []);

  // Ops 8: Realtime. New position -> move truck. Stop updated -> flip status. Round row changed -> reload.
  const roundId = round?.id ?? null;
  useEffect(() => {
    if (offline) return;
    const reload = () =>
      loadActiveRound()
        .then(async (active) => {
          setRound(active?.round ?? null);
          setStops(active?.stops ?? []);
          setFix(active ? await loadLatestFix(active.round.id) : null);
        })
        .catch(() => {});
    const ch = supabase.channel(`map-${roundId ?? "none"}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, reload);
    if (roundId !== null) {
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "truck_positions", filter: `round_id=eq.${roundId}` }, (p) =>
        setFix(p.new as Fix)
      );
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "round_stops", filter: `round_id=eq.${roundId}` }, (p) => {
        const row = p.new as { id: number; served_at: string | null };
        setStops((prev) => prev.map((s) => (s.id === row.id ? { ...s, served_at: row.served_at } : s)));
      });
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roundId, offline]);

  // Demo fallback: glide a fake truck through the mock stops and serve each one on arrival.
  useEffect(() => {
    if (!offline) return;
    let pos: { lat: number; lng: number } | null = null;
    const t = setInterval(() => {
      const next = stopsRef.current.find((s) => !s.served_at);
      if (!next) return;
      pos = pos ?? { lat: next.street.lat + 0.006, lng: next.street.lng - 0.006 };
      pos = { lat: pos.lat + (next.street.lat - pos.lat) * 0.3, lng: pos.lng + (next.street.lng - pos.lng) * 0.3 };
      setFix({ ...pos, recorded_at: new Date().toISOString() });
      if (Math.hypot(next.street.lat - pos.lat, next.street.lng - pos.lng) < 0.0003) {
        const served_at = new Date().toISOString();
        setStops((prev) => prev.map((s) => (s.id === next.id ? { ...s, served_at } : s)));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [offline]);

  const my = streets.find((s) => s.id === myId) ?? null;
  const myStop = stops.find((s) => s.street_id === myId) ?? null;
  const unserved = stops.filter((s) => !s.served_at);
  const next = unserved[0] ?? null;
  // Op 9: stopsAway counts my stop and every unserved stop before it (1 = I am next).
  const stopsAway = myStop && !myStop.served_at ? unserved.filter((s) => s.stop_order <= myStop.stop_order).length : 0;
  const eta =
    fix && next && stopsAway > 0
      ? etaMinutes({ lat: fix.lat, lng: fix.lng, recordedAt: new Date(fix.recorded_at).getTime() }, next.street, stopsAway, now || new Date(fix.recorded_at).getTime())
      : stopsAway * 10; // no GPS yet: stale-rule fallback
  const stale = fix && now ? now - new Date(fix.recorded_at).getTime() > 2 * 60_000 : false;

  function pickStreet(id: number) {
    setMyId(id);
    try { localStorage.setItem(STREET_KEY, String(id)); } catch { /* ignore */ }
  }

  const center = my ?? streets[0] ?? { lat: -20.2475, lng: 57.5010 };

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[390px] flex-col">
      <TruckMap stops={stops} myStreetId={myId} fix={fix} center={{ lat: center.lat, lng: center.lng }} />
      <section className="flex flex-col gap-1 border-t bg-white p-4">
        {offline && <p className="text-xs text-yellow-800">Demo mode: database not reachable, simulated truck.</p>}
        {loading ? (
          <p className="text-lg text-zinc-500">Loading…</p>
        ) : !round ? (
          <p className="text-2xl font-bold">No tanker round right now</p>
        ) : !myStop ? (
          <p className="text-xl font-bold">The tanker is out, but your street is not on this round.</p>
        ) : myStop.served_at ? (
          <p className="text-2xl font-bold text-emerald-700">Tanker arrived! Served ✓</p>
        ) : (
          <>
            <p className="text-2xl font-bold">{stopsAway} stop{stopsAway > 1 ? "s" : ""} away</p>
            <p className="text-lg">Tanker on the way · about {eta} min{stale ? " (GPS signal lost, estimate)" : ""}</p>
            {!fix && <p className="text-sm text-zinc-500">Waiting for the driver&apos;s first GPS fix…</p>}
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-zinc-500">
          Your street:
          <select className="flex-1 rounded border px-2 py-1 text-zinc-800" value={myId ?? ""} onChange={(e) => pickStreet(Number(e.target.value))}>
            {streets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <Link href="/" className="text-sm text-sky-700 underline">← Back</Link>
      </section>
    </main>
  );
}

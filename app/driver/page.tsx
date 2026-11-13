"use client";

// Driver screen (contracts/api.md ops 4-7; docs/NEXT-TASK-SPLIT.md P4 step 7). No login: anyone can open it.
// Several drivers at once: each phone works on ONE round, chosen by ?round=<id> (the link /ops gives)
// or remembered in localStorage "kotdelo.driver.round". It never resumes "the latest round" of someone else.
// Start round -> rounds + round_stops from waiting streets that are NOT already on another active round.
// While active: watchPosition, one truck_positions insert every 5s, screen Wake Lock.
// Served -> this stop only, and only requests that were waiting when this round started.
// Fallbacks: no waiting requests -> every free street; no GPS -> simulated drive;
// Supabase unreachable or no streets -> demo mode (Tanker A/B from a demo dispatch on /ops, nothing saved).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { ASSUMED_REQUEST_L, fmtL } from "@/components/ops/dispatch";
import { createRound, demandByStreet, errText, finishRound, loadActiveRounds, loadStreets, loadWaitingRequests, serveStop, type LiveRound, type Stop, type Street, type WaitingRequest } from "@/components/map/data";
import { DEMO_STREETS, demoRounds, readDemoDispatch, simulateStep } from "@/components/map/demo";

const SEND_EVERY_MS = 5000;
const ROUND_KEY = "kotdelo.driver.round";
type Gps = "waiting" | "live" | "blocked" | "sim";

function rememberRound(id: number | null) {
  try { if (id === null) localStorage.removeItem(ROUND_KEY); else localStorage.setItem(ROUND_KEY, String(id)); } catch { /* private mode */ }
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete("round"); else url.searchParams.set("round", String(id));
  window.history.replaceState(null, "", url);
}

export default function DriverPage() {
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState<string | null>(null); // why we are in demo mode
  const [error, setError] = useState<string | null>(null); // a save that failed; the round keeps going
  const [streets, setStreets] = useState<Street[]>([]);
  const [others, setOthers] = useState<LiveRound[]>([]); // active rounds, for the chooser
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);
  const [mine, setMine] = useState<LiveRound | null>(null);
  const [gps, setGps] = useState<Gps>(() => (typeof navigator !== "undefined" && !("geolocation" in navigator) ? "blocked" : "waiting"));
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const fixRef = useRef<{ lat: number; lng: number } | null>(null);
  const stopsRef = useRef<Stop[]>([]);
  useEffect(() => { stopsRef.current = mine?.stops ?? []; }, [mine]);

  async function refresh() {
    const wanted = Number(new URLSearchParams(window.location.search).get("round")) || Number((() => { try { return localStorage.getItem(ROUND_KEY); } catch { return null; } })()) || null;
    try {
      const [ss, active, reqs] = await Promise.all([loadStreets(), loadActiveRounds(), loadWaitingRequests()]);
      if (ss.length === 0) throw new Error("no streets loaded yet"); // empty DB -> same demo mode as unreachable
      setStreets(ss);
      setOthers(active);
      setWaiting(reqs);
      const found = active.find((r) => r.round.id === wanted) ?? null;
      setMine(found);
      if (wanted && !found) rememberRound(null); // that round ended: back to the chooser
      setOffline(null);
    } catch (e) {
      setOffline(errText(e));
      setStreets(DEMO_STREETS);
      setOthers(readDemoDispatch() ? demoRounds() : []);
      setWaiting([]);
    } finally {
      setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from the database
  useEffect(() => { refresh(); }, []);

  // Streets already on someone else's unserved stops are not offered again.
  const taken = new Set(others.flatMap((r) => r.stops.filter((s) => !s.served_at).map((s) => s.street_id)));
  const demand = demandByStreet(waiting);
  const waitingFree = streets.filter((s) => demand[s.id] && !taken.has(s.id));
  const startStreets = waitingFree.length ? waitingFree : streets.filter((s) => !taken.has(s.id)); // demo fallback: every free street
  const startLitres = waitingFree.reduce((sum, s) => sum + demand[s.id].litres, 0);

  function choose(r: LiveRound) {
    setMine(r);
    setGps("waiting");
    fixRef.current = null;
    if (!offline) rememberRound(r.round.id);
  }

  // Op 4: create my round.
  async function startRound() {
    setError(null);
    if (offline) {
      const started_at = new Date().toISOString();
      return choose({ round: { id: -99, status: "active", started_at }, label: "Demo round", stops: DEMO_STREETS.map((street, i) => ({ id: -9900 - i, round_id: -99, street_id: street.id, stop_order: i + 1, served_at: null, street })) });
    }
    setLoading(true);
    try {
      choose(await createRound(startStreets));
    } catch (e) {
      setError(`Round not started: ${errText(e)}. Try again.`);
    } finally {
      setLoading(false);
    }
  }

  // Op 6: this stop only. On failure the stop goes back to unserved and the driver can retry.
  async function serve(stop: Stop) {
    if (!mine) return;
    setError(null);
    const served_at = new Date().toISOString();
    const patch = (at: string | null) => setMine((m) => (m ? { ...m, stops: m.stops.map((s) => (s.id === stop.id ? { ...s, served_at: at } : s)) } : m));
    patch(served_at);
    if (offline) return;
    try {
      await serveStop(stop, mine.round, served_at);
      loadWaitingRequests().then(setWaiting).catch(() => {});
    } catch (e) {
      patch(null);
      setError(`"${stop.street.name}" was not saved as served: ${errText(e)}. Tap Served again.`);
    }
  }

  // Op 7: close my round. The tracking effect stops because `mine` becomes null.
  async function endRound() {
    if (!mine) return;
    setError(null);
    if (!offline) {
      try { await finishRound(mine.round.id); } catch (e) { return setError(`Round not ended: ${errText(e)}. Try again.`); }
      rememberRound(null);
    }
    setMine(null);
    setGps("waiting");
    setLastSent(null);
    if (!offline) { setLoading(true); refresh(); }
  }

  // Op 5: while my round is active, send the latest GPS fix every 5s and keep the screen on.
  const roundId = mine?.round.id ?? null;
  useEffect(() => {
    if (roundId === null) return;
    let watchId: number | null = null;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const lock = async () => { try { sentinel = (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* not supported or denied: fine */ } };
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
        if (error) return setError(`Location not sent: ${error.message}. Retrying every 5 s.`);
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

  const ago = lastSent && now ? Math.max(0, Math.round((now - lastSent) / 1000)) : null;
  // Litres per stop: the demo dispatch gives them; live they come from requests waiting when the round started.
  const roundDemand = mine && !offline ? demandByStreet(waiting, mine.round.started_at) : {};
  const stopLitres = (s: Stop) => s.litres ?? roundDemand[s.street_id]?.litres ?? null;
  const assumed = Object.values(roundDemand).some((d) => d.assumed) || Object.values(demand).some((d) => d.assumed);
  const remaining = mine?.stops.filter((s) => !s.served_at) ?? [];
  const leftL = remaining.reduce((sum, s) => sum + (stopLitres(s) ?? 0), 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 lg:py-8">
      {offline && <p className="rounded-xl bg-amber-100 px-3 py-2 text-center text-xs text-amber-900">Demo mode: nothing is saved. ({offline})</p>}
      {error && <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">{error}</p>}

      {!mine ? (
        <>
          <h1 className="text-2xl font-bold">Tanker driver</h1>
          <section className="surface flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Start a new round</h2>
            <Button className="h-16 text-lg" disabled={loading || (!offline && startStreets.length === 0)} onClick={startRound}>
              {loading ? "Loading…" : offline ? "Start a demo round · every street" : `Start round · ${startStreets.length} stop${startStreets.length === 1 ? "" : "s"}${startLitres ? ` · ${fmtL(startLitres)}` : ""}`}
            </Button>
            {!loading && !offline && (
              <p className="text-sm text-muted-foreground">
                {startStreets.length === 0
                  ? "Every street is already on another driver's round."
                  : waitingFree.length
                    ? `Streets with waiting requests that no other driver has.${assumed ? ` ${ASSUMED_REQUEST_L} L assumed per request until requests store litres.` : ""}`
                    : "No waiting requests yet. Starting now visits every street no other driver has (demo)."}
              </p>
            )}
          </section>

          {others.length > 0 && (
            <section className="surface flex flex-col gap-3 p-4">
              <h2 className="font-semibold">{offline ? "Dispatched from Operations (demo)" : "Already on the road"}</h2>
              <p className="text-sm text-muted-foreground">{offline ? "Pick the tanker you are driving." : "Only pick a round if you are its driver, for example after your phone restarted."}</p>
              <ul className="flex flex-col gap-2">
                {others.map((r) => {
                  const left = r.stops.filter((s) => !s.served_at);
                  const litres = left.reduce((sum, s) => sum + (s.litres ?? 0), 0);
                  return (
                    <li key={r.round.id}>
                      <Button variant="outline" className="h-14 w-full justify-between text-base" onClick={() => choose(r)}>
                        <span className="font-semibold">{r.label}</span>
                        <span className="text-sm text-muted-foreground">{left.length} stop{left.length === 1 ? "" : "s"} left{litres ? ` · ${fmtL(litres)}` : ""}</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-bold">{mine.label}</h1>
            <p className="text-sm text-muted-foreground">{remaining.length} stop{remaining.length === 1 ? "" : "s"} left{leftL ? ` · ${fmtL(leftL)} to deliver` : ""}</p>
          </header>
          <p className={`text-sm ${gps === "blocked" ? "text-red-700" : "text-emerald-700"}`} aria-live="polite">
            {gps === "live" && `● Sharing location (only during the round)${ago !== null ? ` · sent ${ago}s ago` : ""}`}
            {gps === "sim" && `● Simulated drive (demo)${ago !== null ? ` · sent ${ago}s ago` : ""}`}
            {gps === "waiting" && "● Waiting for GPS… allow location when asked"}
            {gps === "blocked" && "● GPS blocked or unavailable. Needs https on a phone."}
          </p>
          {gps !== "sim" && (
            <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => { fixRef.current = null; setGps("sim"); }}>
              No GPS here? Simulate the drive
            </button>
          )}
          <ol className="flex flex-col gap-2">
            {mine.stops.map((s, i) => {
              const done = !!s.served_at;
              const litres = stopLitres(s);
              const newTrip = s.trip && s.trip > 1 && mine.stops[i - 1]?.trip !== s.trip;
              return (
                <li key={s.id} className="flex flex-col gap-2">
                  {newTrip && <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Trip {s.trip}: refill the tank first</p>}
                  <div className="surface flex items-center gap-3 p-3">
                    <span className="w-6 text-center font-bold">{s.stop_order}</span>
                    <span className={`flex-1 ${done ? "text-muted-foreground line-through" : ""}`}>
                      {s.street.name}
                      {litres ? <span className="block text-sm text-muted-foreground">{fmtL(litres)}{!offline && roundDemand[s.street_id] ? ` · ${roundDemand[s.street_id].requests} request${roundDemand[s.street_id].requests === 1 ? "" : "s"}` : ""}</span> : null}
                    </span>
                    <Button className="h-12" variant={done ? "outline" : "default"} disabled={done} onClick={() => serve(s)}>
                      {done ? "Served ✓" : "Served"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          {assumed && <p className="text-xs text-muted-foreground">{ASSUMED_REQUEST_L} L assumed per request until requests store litres.</p>}
          <Button className="h-14" variant="destructive" onClick={endRound}>
            End round{remaining.length > 0 ? ` (${remaining.length} left)` : ""}
          </Button>
        </>
      )}
      <Link href="/resident" className="text-center text-sm text-muted-foreground underline">Home</Link>
    </main>
  );
}

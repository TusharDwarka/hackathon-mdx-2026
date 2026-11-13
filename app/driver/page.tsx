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
import { Check, Map as MapIcon, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomWaves, PageHeader } from "@/components/ui/brand";
import { supabase } from "@/lib/supabase";
import { ASSUMED_REQUEST_L, fmtL } from "@/components/ops/dispatch";
import { StopProgress } from "@/components/ops/Bars";
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
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-5 pb-6 md:max-w-3xl lg:max-w-5xl lg:gap-6 lg:px-8 lg:pt-8">
      <PageHeader eyebrow="Tanker driver" title={mine ? mine.label : "Today's round"}>
        {mine && (
          <span className={`chip shrink-0 shadow-card ${gps === "blocked" ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>
            <span aria-hidden className={`size-2 rounded-full ${gps === "blocked" ? "bg-red-600" : "animate-pulse bg-emerald-600 motion-reduce:animate-none"}`} />
            {gps === "blocked" ? "No GPS" : gps === "waiting" ? "Waiting for GPS" : "Live"}
          </span>
        )}
      </PageHeader>
      {offline && <p className="rounded-2xl bg-amber-100 px-4 py-2.5 text-sm text-amber-950">Demo mode: nothing is saved. ({offline})</p>}
      {error && <p role="alert" className="rounded-2xl bg-red-100 px-4 py-2.5 text-sm text-red-900">{error}</p>}

      {!mine ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-6">
          <section className="wave-panel relative flex flex-col gap-4 overflow-hidden rounded-3xl p-6 pb-24 shadow-card">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/20">
              <Truck aria-hidden className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-[-0.01em]">Start a new round</h2>
              <p className="mt-1 text-sm text-white/85">Your position is shared only while the round is on, so residents can see the truck coming.</p>
            </div>
            {!loading && !offline && (
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/15 p-3">
                  <dt className="text-xs text-white/80">Stops</dt>
                  <dd className="text-2xl font-bold tabular-nums">{startStreets.length}</dd>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <dt className="text-xs text-white/80">Water to deliver</dt>
                  <dd className="text-2xl font-bold tabular-nums">{startLitres ? fmtL(startLitres) : "–"}</dd>
                </div>
              </dl>
            )}
            <Button size="tap" className="relative z-10 bg-white text-primary hover:bg-white/90" disabled={loading || (!offline && startStreets.length === 0)} onClick={startRound}>
              {loading ? "Loading…" : offline ? "Start a demo round · every street" : `Start round · ${startStreets.length} stop${startStreets.length === 1 ? "" : "s"}${startLitres ? ` · ${fmtL(startLitres)}` : ""}`}
            </Button>
            {!loading && !offline && (
              <p className="relative z-10 text-sm text-white/85">
                {startStreets.length === 0
                  ? "Every street is already on another driver's round."
                  : waitingFree.length
                    ? `Streets with waiting requests that no other driver has.${assumed ? ` ${ASSUMED_REQUEST_L} L assumed per request until requests store litres.` : ""}`
                    : "No waiting requests yet. Starting now visits every street no other driver has (demo)."}
              </p>
            )}
            <BottomWaves className="h-16 text-white/30" />
          </section>

          <section className="surface flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold tracking-[-0.01em]">{offline ? "Dispatched from Operations (demo)" : "Already on the road"}</h2>
            <p className="text-sm text-muted-foreground">
              {others.length === 0 ? "No other round is active right now." : offline ? "Pick the tanker you are driving." : "Only pick a round if you are its driver, for example after your phone restarted."}
            </p>
            <ul className="flex flex-col gap-2">
              {others.map((r) => {
                const left = r.stops.filter((s) => !s.served_at);
                const litres = left.reduce((sum, s) => sum + (s.litres ?? 0), 0);
                return (
                  <li key={r.round.id}>
                    <button
                      type="button"
                      onClick={() => choose(r)}
                      className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-muted px-4 text-left transition-[scale,background-color] duration-150 ease-snap hover:bg-primary/10 active:scale-[0.98]"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-primary"><Truck aria-hidden className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{r.label}</span>
                        <span className="block text-sm text-muted-foreground">{left.length} stop{left.length === 1 ? "" : "s"} left{litres ? ` · ${fmtL(litres)}` : ""}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-6">
          <div className="flex flex-col gap-4 lg:sticky lg:top-8">
            <dl className="grid grid-cols-2 gap-3">
              <div className="surface p-4">
                <dt className="text-xs text-muted-foreground">Stops left</dt>
                <dd className="text-3xl font-bold tracking-[-0.02em] tabular-nums">{remaining.length}<span className="text-base font-medium text-muted-foreground">/{mine.stops.length}</span></dd>
              </div>
              <div className="surface p-4">
                <dt className="text-xs text-muted-foreground">To deliver</dt>
                <dd className="text-3xl font-bold tracking-[-0.02em] tabular-nums">{leftL ? fmtL(leftL) : "–"}</dd>
              </div>
            </dl>
            <div className="surface flex flex-col gap-2 p-4">
              <p className="flex justify-between text-xs text-muted-foreground">
                <span>Round progress</span>
                <span className="tabular-nums">{mine.stops.length - remaining.length} of {mine.stops.length} served</span>
              </p>
              <StopProgress served={mine.stops.map((s) => !!s.served_at)} className="h-3" />
            </div>
            <section className="surface flex flex-col gap-2 p-5">
              <h2 className="font-semibold">Location sharing</h2>
              <p className={`text-sm ${gps === "blocked" ? "text-red-800" : "text-emerald-800"}`} aria-live="polite">
                {gps === "live" && `Sharing location (only during the round)${ago !== null ? ` · sent ${ago}s ago` : ""}`}
                {gps === "sim" && `Simulated drive (demo)${ago !== null ? ` · sent ${ago}s ago` : ""}`}
                {gps === "waiting" && "Waiting for GPS… allow location when asked"}
                {gps === "blocked" && "GPS blocked or unavailable. Needs https on a phone."}
              </p>
              {gps !== "sim" && (
                <button type="button" className="min-h-11 self-start text-sm font-medium text-primary underline underline-offset-2" onClick={() => { fixRef.current = null; setGps("sim"); }}>
                  No GPS here? Simulate the drive
                </button>
              )}
              <Link href="/map" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
                <MapIcon aria-hidden className="size-4" /> Open the live map
              </Link>
            </section>
            <Button size="tap" variant="destructive" className="hidden lg:inline-flex" onClick={endRound}>
              End round{remaining.length > 0 ? ` (${remaining.length} left)` : ""}
            </Button>
          </div>

          <section className="surface p-3 sm:p-4">
            <h2 className="px-2 pt-1 pb-2 text-lg font-bold tracking-[-0.01em]">Stops</h2>
            <ol className="flex flex-col gap-2">
              {mine.stops.map((s, i) => {
                const done = !!s.served_at;
                const isNext = s.id === remaining[0]?.id;
                const litres = stopLitres(s);
                const newTrip = s.trip && s.trip > 1 && mine.stops[i - 1]?.trip !== s.trip;
                return (
                  <li key={s.id} className="flex flex-col gap-2">
                    {newTrip && <p className="px-2 pt-2 text-xs font-semibold tracking-wide text-amber-800 uppercase">Trip {s.trip}: refill the tank first</p>}
                    <div className={`flex items-center gap-3 rounded-2xl p-3 ${isNext ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/60"}`}>
                      <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-emerald-700 text-white" : isNext ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                        {done ? <Check aria-hidden className="size-4" strokeWidth={3} /> : s.stop_order}
                      </span>
                      <span className={`min-w-0 flex-1 ${done ? "text-muted-foreground line-through" : "font-medium"}`}>
                        {s.street.name}
                        {isNext && <span className="ml-2 text-xs font-semibold text-primary no-underline">Next</span>}
                        {litres ? <span className="block text-sm font-normal text-muted-foreground">{fmtL(litres)}{!offline && roundDemand[s.street_id] ? ` · ${roundDemand[s.street_id].requests} request${roundDemand[s.street_id].requests === 1 ? "" : "s"}` : ""}</span> : null}
                      </span>
                      <Button className="h-12 px-5 font-semibold" variant={done ? "outline" : "default"} disabled={done} onClick={() => serve(s)}>
                        {done ? "Served ✓" : "Served"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {assumed && <p className="px-2 pt-3 text-xs text-muted-foreground">{ASSUMED_REQUEST_L} L assumed per request until requests store litres.</p>}
          </section>
          <Button size="tap" variant="destructive" className="lg:hidden" onClick={endRound}>
            End round{remaining.length > 0 ? ` (${remaining.length} left)` : ""}
          </Button>
        </div>
      )}
    </main>
  );
}

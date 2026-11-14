"use client";

// Driver screen (contracts/api.md ops 4-7). The hierarchy: a resident requests, CWA staff assign the streets
// to a tanker on /ops Dispatch, and only then does that tanker's driver see the round here and tap Start.
// A driver never builds a round from the requests themselves.
// The driver signs in on /login (tanker + access code); every write goes through /api/rounds, which checks
// that the round belongs to this tanker.
// While active: watchPosition, one position every 5s (snapped to the road), screen Wake Lock.
// Fallbacks: no GPS -> simulated drive along the road; Supabase unreachable or no streets -> demo mode
// (Tanker A/B from a demo dispatch on /ops, nothing saved).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Map as MapIcon, Navigation, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { PipeLoader } from "@/components/ui/pipe-loader";
import { BottomWaves, PageHeader } from "@/components/ui/brand";
import { supabase } from "@/lib/supabase";
import { getRounds, roundAction, type RoundView } from "@/lib/queries";
import { fmtL } from "@/components/ops/dispatch";
import { StopProgress } from "@/components/ops/Bars";
import { errText, loadStreets, roundLabel, type LiveRound, type Stop, type Street } from "@/components/map/data";
import { DEMO_STREETS, demoRounds, readDemoDispatch } from "@/components/map/demo";
import { roadSim, snapToRoad } from "@/components/map/road";

const SEND_EVERY_MS = 5000;
const SIM_STEP_M = 120; // simulated drive: metres per position sent (fast on purpose, for the demo)
type Gps = "waiting" | "live" | "blocked" | "sim";

/** Google Maps directions through the stops left, in order.
 *  ponytail: Maps URLs take 9 waypoints, so it routes the next 10 stops; reopen it after those. */
function routeUrl(stops: Stop[]): string | null {
  const next = stops.slice(0, 10);
  if (!next.length) return null;
  const pt = (s: Stop) => `${s.street.lat},${s.street.lng}`;
  const via = next.slice(0, -1).map(pt).join("|");
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${pt(next[next.length - 1])}${via ? `&waypoints=${encodeURIComponent(via)}` : ""}`;
}

/** The API's round (street names only) joined with the street points the route needs. */
function toLive(v: RoundView, streets: Map<number, Street>): LiveRound {
  return {
    round: { id: v.id, status: v.status, started_at: v.started_at },
    label: v.tanker?.name ?? roundLabel(v.id),
    stops: v.stops.flatMap((s): Stop[] => {
      const street = streets.get(s.street_id);
      return street ? [{ id: s.id, round_id: v.id, street_id: s.street_id, stop_order: s.stop_order, served_at: s.served_at, street, litres: s.litres || undefined }] : [];
    }),
  };
}

export default function DriverPage() {
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState<string | null>(null); // why we are in demo mode
  const [signedOut, setSignedOut] = useState(false); // no driver session: rounds are per tanker, so sign in first
  const [error, setError] = useState<string | null>(null); // a save that failed; the round keeps going
  const [assigned, setAssigned] = useState<LiveRound[]>([]); // sent by CWA, not started yet (demo: Tanker A/B)
  const [mine, setMine] = useState<LiveRound | null>(null);
  const [gps, setGps] = useState<Gps>(() => (typeof navigator !== "undefined" && !("geolocation" in navigator) ? "blocked" : "waiting"));
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [sharing, setSharing] = useState(true); // the driver can pause location sharing at any time
  const [now, setNow] = useState(0);
  const fixRef = useRef<{ lat: number; lng: number } | null>(null);
  const stopsRef = useRef<Stop[]>([]);
  useEffect(() => { stopsRef.current = mine?.stops ?? []; }, [mine]);

  async function refresh() {
    try {
      const [ss, res] = await Promise.all([loadStreets(), getRounds()]);
      if (ss.length === 0) throw new Error("no streets loaded yet"); // empty DB -> same demo mode as unreachable
      setOffline(null);
      setSignedOut(res.role !== "driver");
      const byId = new Map(ss.map((s) => [s.id, s]));
      const rounds = res.role === "driver" ? res.rounds.map((v) => toLive(v, byId)) : [];
      setAssigned(rounds.filter((r) => r.round.status === "planned"));
      setMine(rounds.find((r) => r.round.status === "active") ?? null);
    } catch (e) {
      setOffline(errText(e));
      setAssigned(readDemoDispatch() ? demoRounds() : []);
    } finally {
      setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from the database
  useEffect(() => { refresh(); }, []);

  // A round sent (or cancelled) by CWA staff shows up without a reload.
  const live = !loading && !offline && !signedOut;
  useEffect(() => {
    if (!live) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(t); t = setTimeout(refresh, 700); };
    const ch = supabase
      .channel("driver-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "round_stops" }, soon)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [live]);

  // Op 4: start the round CWA staff assigned to my tanker (demo: a demo round, or one over the mock streets).
  async function startRound(r?: LiveRound) {
    setError(null);
    setGps((g) => (g === "blocked" ? g : "waiting"));
    fixRef.current = null;
    if (offline) {
      const started_at = new Date().toISOString();
      return setMine(r ?? { round: { id: -99, status: "active", started_at }, label: "Demo round", stops: DEMO_STREETS.map((street, i) => ({ id: -9900 - i, round_id: -99, street_id: street.id, stop_order: i + 1, served_at: null, street })) });
    }
    setLoading(true);
    try {
      await roundAction({ action: "start" });
      await refresh();
    } catch (e) {
      setError(`Round not started: ${errText(e)}. Try again.`);
      setLoading(false);
    }
  }

  // Op 6: this stop only. On failure the stop goes back to unserved and the driver can retry.
  async function serve(stop: Stop) {
    if (!mine) return;
    setError(null);
    const patch = (at: string | null) => setMine((m) => (m ? { ...m, stops: m.stops.map((s) => (s.id === stop.id ? { ...s, served_at: at } : s)) } : m));
    patch(new Date().toISOString());
    if (offline) return;
    try {
      await roundAction({ action: "serve", round_stop_id: stop.id });
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
      try { await roundAction({ action: "end", round_id: mine.round.id }); } catch (e) { return setError(`Round not ended: ${errText(e)}. Try again.`); }
    }
    setMine(null);
    setLastSent(null);
    if (!offline) { setLoading(true); refresh(); }
  }

  // Op 5: while my round is active, send the latest position every 5s and keep the screen on.
  // Real GPS is snapped to the nearest road; the simulated drive follows the road to the next stop.
  const roundId = mine?.round.id ?? null;
  useEffect(() => {
    if (roundId === null || !sharing) return;
    let watchId: number | null = null;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const sim = roadSim();
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
      const fix = gps === "sim" ? sim(stopsRef.current, SIM_STEP_M) : fixRef.current && (await snapToRoad(fixRef.current));
      if (!fix || cancelled) return;
      if (!offline && roundId > 0) {
        try { await roundAction({ action: "position", round_id: roundId, lat: fix.lat, lng: fix.lng }); }
        catch (e) { return setError(`Location not sent: ${errText(e)}. Retrying every 5 s.`); }
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
  }, [roundId, gps, offline, sharing]);

  const ago = lastSent && now ? Math.max(0, Math.round((now - lastSent) / 1000)) : null;
  const remaining = mine?.stops.filter((s) => !s.served_at) ?? [];
  const leftL = remaining.reduce((sum, s) => sum + (s.litres ?? 0), 0);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-5 pb-6 md:max-w-3xl lg:max-w-5xl lg:gap-6 lg:px-8 lg:pt-8">
      <PageHeader eyebrow="Tanker driver" title={mine ? mine.label : "Today's round"}>
        {mine && (
          <span className={`chip shrink-0 shadow-card ${!sharing ? "bg-muted text-muted-foreground" : gps === "blocked" ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>
            <span aria-hidden className={`size-2 rounded-full ${!sharing ? "bg-muted-foreground" : gps === "blocked" ? "bg-red-600" : "animate-pulse bg-emerald-600 motion-reduce:animate-none"}`} />
            {!sharing ? "Paused" : gps === "blocked" ? "No GPS" : gps === "waiting" ? "Waiting for GPS" : "Live"}
          </span>
        )}
      </PageHeader>
      {offline && <p className="rounded-2xl bg-amber-100 px-4 py-2.5 text-sm text-amber-950">Demo mode: nothing is saved.</p>}
      {error && <p role="alert" className="rounded-2xl bg-red-100 px-4 py-2.5 text-sm text-red-900">{error}</p>}

      {!mine ? (
        <div className="grid grid-cols-1 gap-4 lg:max-w-xl">
          {loading ? (
            <section className="surface grid min-h-40 place-items-center p-5"><PipeLoader /></section>
          ) : !offline && signedOut ? (
            <section className="surface flex flex-col gap-3 p-5">
              <h2 className="text-lg font-bold tracking-[-0.01em]">Sign in as a tanker driver</h2>
              <p className="text-sm text-muted-foreground">CWA staff send each round to one tanker. Sign in with your tanker to see yours.</p>
              <Link href="/login" className="flex h-14 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">Sign in</Link>
            </section>
          ) : !offline && assigned.length === 0 ? (
            <section className="surface flex flex-col gap-2 p-5">
              <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Truck aria-hidden className="size-6" /></span>
              <h2 className="text-lg font-bold tracking-[-0.01em]">No round assigned yet</h2>
              <p className="text-sm text-muted-foreground">CWA staff choose the streets and send them to your tanker. Your round appears here by itself.</p>
            </section>
          ) : (
            (offline && assigned.length === 0 ? [undefined] : assigned).map((r) => {
              const litres = r?.stops.reduce((sum, s) => sum + (s.litres ?? 0), 0) ?? 0;
              return (
                <section key={r?.round.id ?? "demo"} className="wave-panel relative flex flex-col gap-4 overflow-hidden rounded-3xl p-6 pb-24 shadow-card">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white/20">
                    <Truck aria-hidden className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-white/85">{r ? "Sent by CWA" : "Demo"}</p>
                    <h2 className="text-xl font-bold tracking-[-0.01em]">{r ? r.label : "Start a demo round"}</h2>
                    {r && <p className="mt-1 line-clamp-2 text-sm text-white/85">{r.stops.map((s) => s.street.name).join(" → ")}</p>}
                  </div>
                  {r && (
                    <dl className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white/15 p-3">
                        <dt className="text-xs text-white/80">Stops</dt>
                        <dd className="text-2xl font-bold tabular-nums">{r.stops.length}</dd>
                      </div>
                      <div className="rounded-2xl bg-white/15 p-3">
                        <dt className="text-xs text-white/80">Water to deliver</dt>
                        <dd className="text-2xl font-bold tabular-nums">{litres ? fmtL(litres) : "–"}</dd>
                      </div>
                    </dl>
                  )}
                  <Button size="tap" className="relative z-10 bg-white text-primary hover:bg-white/90" onClick={() => startRound(r)}>
                    {r ? `Start round · ${r.stops.length} stop${r.stops.length === 1 ? "" : "s"}` : "Start a demo round"}
                  </Button>
                  <BottomWaves className="h-16 text-white/30" />
                </section>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-6">
          <div className="flex flex-col gap-4 lg:sticky lg:top-8">
            {remaining.length > 0 && (
              <section className="wave-panel relative flex flex-col gap-3 overflow-hidden rounded-3xl p-5 shadow-card">
                <p className="text-sm text-white/85">Next stop</p>
                <p className="-mt-2 text-2xl font-bold tracking-[-0.01em]">{remaining[0].street.name}</p>
                <a href={routeUrl(remaining)!} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-primary">
                  <Navigation aria-hidden className="size-5" /> Open route in Google Maps
                </a>
                <p className="text-xs text-white/80">Drives you through the {Math.min(remaining.length, 10)} stops left, in order.</p>
              </section>
            )}
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
              <label className="flex min-h-11 items-center justify-between gap-3">
                <span className="font-semibold">Share my location</span>
                <input type="checkbox" role="switch" className="size-6 accent-primary" checked={sharing} onChange={() => { setSharing((v) => !v); setGps((g) => (g === "sim" ? g : "waiting")); }} />
              </label>
              <p className={`text-sm ${!sharing ? "text-muted-foreground" : gps === "blocked" ? "text-red-800" : "text-emerald-800"}`} aria-live="polite">
                {!sharing && "Paused. Residents don't see the truck move."}
                {sharing && gps === "live" && `Residents see the truck${ago !== null ? ` · sent ${ago}s ago` : ""}`}
                {sharing && gps === "sim" && `Simulated drive${ago !== null ? ` · sent ${ago}s ago` : ""}`}
                {sharing && gps === "waiting" && "Waiting for GPS. Allow location when asked."}
                {sharing && gps === "blocked" && "GPS is blocked. Allow location for this site."}
              </p>
              {sharing && gps !== "sim" && (
                <button type="button" className="min-h-11 self-start text-sm font-medium text-primary underline underline-offset-2" onClick={() => { fixRef.current = null; setGps("sim"); }}>
                  Simulate the drive instead
                </button>
              )}
              <Link href="/map" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
                <MapIcon aria-hidden className="size-4" /> Open the live map
              </Link>
            </section>
            <ConfirmButton size="tap" variant="destructive" className="hidden lg:inline-flex" danger title="End this round?" body={remaining.length ? `${remaining.length} stop${remaining.length === 1 ? " is" : "s are"} not served yet. Location sharing stops.` : "Location sharing stops."} confirm="Yes, end" onConfirm={endRound}>
              End round{remaining.length > 0 ? ` (${remaining.length} left)` : ""}
            </ConfirmButton>
          </div>

          <section className="surface p-3 sm:p-4">
            <h2 className="px-2 pt-1 pb-2 text-lg font-bold tracking-[-0.01em]">Stops</h2>
            <ol className="flex flex-col gap-2">
              {mine.stops.map((s, i) => {
                const done = !!s.served_at;
                const isNext = s.id === remaining[0]?.id;
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
                        {s.litres ? <span className="block text-sm font-normal text-muted-foreground">{fmtL(s.litres)}</span> : null}
                      </span>
                      <Button className="h-12 px-5 font-semibold" variant={done ? "outline" : "default"} disabled={done} onClick={() => serve(s)}>
                        {done ? "Served ✓" : "Served"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          <ConfirmButton size="tap" variant="destructive" className="lg:hidden" danger title="End this round?" body={remaining.length ? `${remaining.length} stop${remaining.length === 1 ? " is" : "s are"} not served yet. Location sharing stops.` : "Location sharing stops."} confirm="Yes, end" onConfirm={endRound}>
            End round{remaining.length > 0 ? ` (${remaining.length} left)` : ""}
          </ConfirmButton>
        </div>
      )}
    </main>
  );
}

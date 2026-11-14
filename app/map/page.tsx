"use client";

// Resident map (contracts/api.md ops 1, 8, 9; docs/NEXT-TASK-SPLIT.md P4 steps 1-4, 7).
// Several tankers can be out: the map follows the round that carries MY street and shows the others greyed.
// Layers: live tankers, resident reports (last 3 h), supply reliability (last 14 days), official notices,
// tanker stops / water points (nearest to my street highlighted; no river suggestions, DECISIONS #7).
// Phones: map on top, panel below. From 1024px: panel on the right. The map resizes with its container.
// My street: ?street=<id>, else localStorage "kotdelo.street" (same key as /resident), else the first street.
// Fallback: Supabase unreachable OR no streets loaded yet -> demo mode with simulated tankers.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers as LayersIcon, LocateFixed, Search } from "lucide-react";
import { PipeLoader } from "@/components/ui/pipe-loader";
import { LangSwitch } from "@/components/ui/i18n";
import { supabase } from "@/lib/supabase";
import { etaLabel, etaMinutes, km } from "@/lib/eta";
import { NEAR_RIVER_M, foldName, loadPlaces, nearestRiver, placeLabel, searchPlaces, type Place, type Rivers } from "@/lib/queries";
import { getRivers, loadSupply } from "@/components/home/Locality";
import { BASIS_HEX, LiveMap, type AreaNotice, type Layers, type LocalityMarker, type TankerMarker, type WaterMarker } from "@/components/map/LiveMap";
import { errText, loadActiveRounds, loadAreas, loadLatestFixes, loadReports, loadSchedule, loadStreets, loadWaterPoints, type Area, type Fix, type LiveRound, type Street, type WaterPoint } from "@/components/map/data";
import { areaNotice, noticeTimes, reportSignals, streetReliability, RELIABILITY_DAYS, type ScheduleRow } from "@/components/map/layers";
import { arrived, DEMO_AREA, DEMO_STREETS, DEMO_WATER_POINTS, demoHistory, demoRounds, demoSchedule } from "@/components/map/demo";
import { roadSim } from "@/components/map/road";
import type { RecentReport } from "@/components/ops/rules";

const STREET_KEY = "kotdelo.street"; // shared with /resident
const STALE_MS = 2 * 60_000;
const LAYER_INFO: { key: keyof Layers; label: string }[] = [
  { key: "tankers", label: "Live tankers" },
  { key: "reports", label: "Streets: water now" },
  { key: "notices", label: "Official notices" },
  { key: "water", label: "Tanker stops and water points" },
  { key: "localities", label: "All Mauritius: supply timetable" },
  { key: "rivers", label: "Rivers and streams" },
];
const FREQ: Record<string, string> = { daily: "Every day", every_2_days: "Every second day" };
const BASIS_LABEL = { locality_notice: "CWA notice for this locality", regional_timetable: "regional timetable only", unknown: "not known yet" } as const;
const ISLAND = { lat: -20.25, lng: 57.55 };

export default function MapPage() {
  const [streets, setStreets] = useState<Street[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [areaPick, setAreaPick] = useState<number | null>(null); // locality chosen before a street
  const [rounds, setRounds] = useState<LiveRound[]>([]);
  const [fixes, setFixes] = useState<Record<number, Fix>>({});
  const [reports, setReports] = useState<RecentReport[] | null>(null); // null = layer unavailable
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [waterPoints, setWaterPoints] = useState<WaterPoint[] | null>(null); // null = not available
  const [offline, setOffline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [layers, setLayers] = useState<Layers>({ tankers: true, reports: true, notices: true, water: true, rivers: false, localities: false });
  const [layersOpen, setLayersOpen] = useState(false); // phones only; always open from 1024px
  // V5 island-wide: rivers, every locality by supply basis, place search, "near a river?" (on the phone only).
  const [rivers, setRivers] = useState<Rivers | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [localities, setLocalities] = useState<LocalityMarker[]>([]);
  const [islandError, setIslandError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [jump, setJump] = useState<{ key: string; points: { lat: number; lng: number }[]; zoom?: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const roundsRef = useRef<LiveRound[]>([]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);

  const reloadRounds = useCallback(async () => {
    const active = await loadActiveRounds();
    setRounds(active);
    setFixes(await loadLatestFixes(active.map((r) => r.round.id)));
  }, []);

  const startDemo = useCallback((why: string) => {
    setOffline(why);
    setStreets(DEMO_STREETS);
    setAreas([DEMO_AREA]);
    setRounds(demoRounds());
    setFixes({});
    setReports(demoHistory());
    setSchedule(demoSchedule());
    setWaterPoints(DEMO_WATER_POINTS);
  }, []);

  // Initial load.
  useEffect(() => {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("street"));
    let stored = 0;
    try { stored = Number(localStorage.getItem(STREET_KEY)); } catch { /* private mode */ }
    Promise.all([loadStreets(), loadAreas(), loadActiveRounds()])
      .then(async ([ss, as, active]) => {
        if (ss.length === 0) throw new Error("no streets loaded yet"); // empty DB -> same demo mode as unreachable
        setStreets(ss);
        setAreas(as);
        setMyId(ss.some((s) => s.id === fromUrl) ? fromUrl : ss.some((s) => s.id === stored) ? stored : ss[0].id);
        setRounds(active);
        setFixes(await loadLatestFixes(active.map((r) => r.round.id)));
        setOffline(null);
        // Optional layers: a failure hides that layer, it does not break the tanker map.
        loadReports(RELIABILITY_DAYS).then(setReports).catch(() => setReports(null));
        loadSchedule().then(setSchedule).catch(() => setSchedule(null));
        loadWaterPoints().then(setWaterPoints).catch(() => setWaterPoints(null)); // table not loaded yet
      })
      .catch((e) => {
        startDemo(errText(e));
        setMyId(DEMO_STREETS.some((s) => s.id === fromUrl) ? fromUrl : DEMO_STREETS.some((s) => s.id === stored) ? stored : DEMO_STREETS[2].id);
      })
      .finally(() => { setLoading(false); setNow(Date.now()); });
    const clock = setInterval(() => setNow(Date.now()), 5000); // ETA staleness and notice expiry
    return () => clearInterval(clock);
  }, [startDemo]);

  // Live: one Realtime channel for every round. Reports are not on Realtime, so they refresh every 2 min.
  useEffect(() => {
    if (offline || loading) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => { reloadRounds().catch(() => {}); }, 700); };
    const ch = supabase
      .channel("map-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "round_stops" }, soon)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "round_stops" }, (p) => {
        const row = p.new as { id: number; round_id: number; served_at: string | null };
        setRounds((prev) => prev.map((r) => (r.round.id !== row.round_id ? r : { ...r, stops: r.stops.map((s) => (s.id === row.id ? { ...s, served_at: row.served_at } : s)) })));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "truck_positions" }, (p) => {
        const row = p.new as Fix & { round_id: number };
        if (roundsRef.current.some((r) => r.round.id === row.round_id)) setFixes((f) => ({ ...f, [row.round_id]: { lat: row.lat, lng: row.lng, recorded_at: row.recorded_at } }));
      })
      .subscribe();
    const poll = setInterval(() => loadReports(RELIABILITY_DAYS).then(setReports).catch(() => {}), 120_000);
    return () => { clearTimeout(timer); clearInterval(poll); supabase.removeChannel(ch); };
  }, [offline, loading, reloadRounds]);

  // Demo: every tanker drives along the road to its next stop and serves it on arrival. A dispatch confirmed on /ops in
  // another tab (same browser) replaces the demo rounds.
  useEffect(() => {
    if (!offline) return;
    const sims = new Map<number, ReturnType<typeof roadSim>>();
    const t = setInterval(() => {
      const served: { round: number; stop: number }[] = [];
      const next: Record<number, Fix> = {};
      for (const r of roundsRef.current) {
        if (!sims.has(r.round.id)) sims.set(r.round.id, roadSim());
        const p = sims.get(r.round.id)!(r.stops, 25);
        if (!p) continue; // its first route is still loading
        next[r.round.id] = { ...p, recorded_at: new Date().toISOString() };
        const stop = r.stops.find((s) => !s.served_at);
        if (stop && arrived(p, stop.street)) served.push({ round: r.round.id, stop: stop.id });
      }
      setFixes(next);
      if (served.length) {
        const at = new Date().toISOString();
        setRounds((prev) => prev.map((r) => ({ ...r, stops: r.stops.map((s) => (served.some((x) => x.stop === s.id) ? { ...s, served_at: at } : s)) })));
      }
    }, 1000);
    const onStorage = (e: StorageEvent) => { if (e.key === "kotdelo.demo-dispatch") { sims.clear(); setRounds(demoRounds()); } };
    window.addEventListener("storage", onStorage);
    return () => { clearInterval(t); window.removeEventListener("storage", onStorage); };
  }, [offline]);

  // V5: load the island files only when a layer, the search or "near a river?" needs them.
  const needRivers = layers.rivers || pin !== null;
  useEffect(() => {
    if (!needRivers || rivers) return;
    getRivers().then(setRivers).catch(() => setIslandError("The river map did not load."));
  }, [needRivers, rivers]);
  const needPlaces = layers.localities || query.trim() !== "";
  useEffect(() => {
    if (!needPlaces || places) return;
    loadPlaces().then(setPlaces).catch(() => setIslandError("The places list did not load."));
  }, [needPlaces, places]);
  useEffect(() => {
    if (!layers.localities || !places || localities.length) return;
    loadSupply()
      .then((rules) => {
        const byName = new Map<string, typeof rules>();
        for (const r of rules) byName.set(foldName(r.l), [...(byName.get(foldName(r.l)) ?? []), r]);
        setLocalities(places.filter((p) => p.l === p.n).map((p) => {
          const known = (byName.get(foldName(p.n)) ?? []).filter((r) => r.b !== "unknown" && r.s);
          const basis = known[0]?.b ?? "unknown";
          const text = known.length
            ? `${FREQ[known[0].f] ?? "Planned"} ${known.map((r) => `${r.s}–${r.e}`).join(" and ")} (${BASIS_LABEL[basis]})`
            : "Supply hours not known yet.";
          return { name: p.n, district: p.d, lat: p.lat, lng: p.lng, basis, text };
        }));
        setJump({ key: "island", points: [ISLAND], zoom: 10 });
      })
      .catch(() => setIslandError("The supply timetable did not load."));
  }, [layers.localities, places, localities.length]);

  const hits = places && query.trim() ? searchPlaces(places, query, 6) : [];
  const goTo = (p: Place) => {
    setPin({ lat: p.lat, lng: p.lng, label: p.n });
    setJump({ key: `place|${p.n}|${p.lat}`, points: [p], zoom: p.l === p.n ? 14 : 16 });
    setQuery("");
  };
  const locate = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("This browser cannot share a location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPin({ ...p, label: "You are here" });
        setJump({ key: `me|${p.lat}|${p.lng}`, points: [p], zoom: 15 });
      },
      () => setGeoError("Location not shared."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };
  const river = pin && rivers ? nearestRiver(pin.lat, pin.lng, rivers) : null;
  const metres = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

  // ----- derived -----
  const hasMine = (r: LiveRound, unservedOnly: boolean) => r.stops.some((s) => s.street_id === myId && (!unservedOnly || !s.served_at));
  const myRound = rounds.find((r) => hasMine(r, true)) ?? rounds.find((r) => hasMine(r, false)) ?? null;
  const myStops = myRound?.stops.filter((s) => s.street_id === myId) ?? [];
  const myStop = myStops.find((s) => !s.served_at) ?? myStops[myStops.length - 1] ?? null;
  const unserved = myRound?.stops.filter((s) => !s.served_at) ?? [];
  const nextStop = unserved[0] ?? null;
  // Op 9: stopsAway counts my stop and every unserved stop before it (1 = I am next).
  const stopsAway = myStop && !myStop.served_at ? unserved.filter((s) => s.stop_order <= myStop.stop_order).length : 0;
  const myFix = myRound ? fixes[myRound.round.id] ?? null : null;
  const isStale = (f: Fix) => now > 0 && now - new Date(f.recorded_at).getTime() > STALE_MS;
  const stale = myFix ? isStale(myFix) : false;
  const eta = myFix && nextStop && stopsAway > 0
    ? etaMinutes({ lat: myFix.lat, lng: myFix.lng, recordedAt: new Date(myFix.recorded_at).getTime() }, nextStop.street, stopsAway, now || new Date(myFix.recorded_at).getTime())
    : stopsAway * 10; // no GPS yet: stale-rule fallback
  const myLitres = myStops.reduce((s, x) => s + (x.litres ?? 0), 0);

  const tankers: TankerMarker[] = rounds.flatMap((r) => {
    const f = fixes[r.round.id];
    return f ? [{ id: r.round.id, label: r.label, fix: f, mine: r === myRound, stale: isStale(f) }] : [];
  });
  const signals = useMemo(() => (reports && now ? reportSignals(streets, reports, now) : {}), [streets, reports, now]);
  const reliability = useMemo(() => (reports && now ? streetReliability(streets.map((s) => s.id), reports, now) : {}), [streets, reports, now]);
  const minute = Math.floor(now / 60_000);
  const { plotted, unplotted } = useMemo(() => {
    const plotted: AreaNotice[] = [];
    const unplotted: string[] = [];
    if (!schedule || !minute) return { plotted, unplotted };
    const byArea = new Map<number, ScheduleRow[]>();
    for (const row of schedule) byArea.set(row.area_id, [...(byArea.get(row.area_id) ?? []), row]);
    for (const [areaId, rows] of byArea) {
      const notice = areaNotice(rows, new Date(minute * 60_000));
      if (!notice) continue; // timetable ran out: the notice expired
      const name = areas.find((a) => a.id === areaId)?.name ?? `Area ${areaId}`;
      const pts = streets.filter((s) => s.area_id === areaId);
      if (!pts.length) { unplotted.push(name); continue; } // no streets for it: list it, never guess a place
      plotted.push({ area_id: areaId, name, notice, lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });
    }
    return { plotted, unplotted };
  }, [schedule, areas, streets, minute]);

  const my = streets.find((s) => s.id === myId) ?? null;
  const areaId = areaPick ?? my?.area_id ?? null;
  const areaStreets = useMemo(() => streets.filter((s) => s.area_id === areaId).sort((a, b) => a.name.localeCompare(b.name)), [streets, areaId]);
  const areaOptions = useMemo(() => areas.filter((a) => streets.some((s) => s.area_id === a.id)).sort((a, b) => a.name.localeCompare(b.name)), [areas, streets]);
  const water: WaterMarker[] = useMemo(() => {
    const pts = (waterPoints ?? []).map((p) => ({ ...p, nearest: false, km: my ? km(my, p) : null }));
    const best = pts.reduce<(typeof pts)[number] | null>((b, p) => (p.km != null && (!b || p.km < b.km!) ? p : b), null);
    if (best) best.nearest = true;
    return pts;
  }, [waterPoints, my]);
  const nearest = water.find((p) => p.nearest) ?? null;
  const dist = (k: number) => (k < 1 ? `${Math.round(k * 100) * 10} m` : `${k.toFixed(1)} km`);
  const focus = jump ?? {
    key: `${myId}|${myRound?.round.id ?? "none"}|${myFix ? "fix" : "nofix"}|${streets.length}`,
    points: my ? (myFix ? [my, myFix] : [my]) : streets,
  };

  function pickStreet(id: number) {
    setJump(null);
    setAreaPick(null);
    setMyId(id);
    try { localStorage.setItem(STREET_KEY, String(id)); } catch { /* ignore */ }
  }
  function pickArea(id: number) {
    setAreaPick(id);
    const pts = streets.filter((s) => s.area_id === id);
    if (pts.length) setJump({ key: `area-${id}`, points: pts });
  }
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <main className="flex h-[calc(100dvh-var(--nav-h))] min-h-0 flex-col lg:flex-row">
      <div className="relative min-h-[45%] flex-1 lg:min-h-0">
        <LiveMap
          streets={streets}
          stops={myRound?.stops ?? []}
          myStreetId={myId}
          tankers={tankers}
          signals={signals}
          reliability={reliability}
          notices={plotted}
          water={water}
          layers={layers}
          focus={focus}
          rivers={rivers}
          localities={localities}
          pin={pin}
        />
      </div>

      <aside className="flex max-h-[55%] flex-col gap-3 overflow-y-auto bg-card p-4 shadow-card lg:max-h-none lg:w-96 lg:shrink-0">
        <LangSwitch className="self-end" />
        {offline && <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900">Demo mode: sample streets, simulated tankers.</p>}

        <section aria-live="polite" className="flex flex-col gap-1">
          {loading ? (
            <PipeLoader />
          ) : !rounds.length ? (
            <p className="text-2xl font-bold">No tanker round right now</p>
          ) : !myRound || !myStop ? (
            <p className="text-xl font-bold">{rounds.length === 1 ? "A tanker is" : `${rounds.length} tankers are`} out, but your street is not on a round.</p>
          ) : myStop.served_at ? (
            <p className="text-2xl font-bold text-emerald-700">Tanker arrived! Served ✓</p>
          ) : (
            <>
              <p className="text-2xl font-bold">{stopsAway} stop{stopsAway > 1 ? "s" : ""} away</p>
              {myRound.round.status === "planned"
                ? <p className="text-lg">CWA assigned {myRound.label} to your street. It has not left yet.</p>
                : <p className="text-lg">{myRound.label} on the way · {etaLabel(eta)}{stale ? " (GPS signal lost, estimate)" : ""}</p>}
              {myLitres > 0 && <p className="text-sm text-muted-foreground">About {myLitres} L planned for your street.</p>}
              {!myFix && myRound.round.status === "active" && <p className="text-sm text-muted-foreground">Waiting for the driver&apos;s first GPS fix…</p>}
            </>
          )}
          {nearest && layers.water && (
            <p className="text-sm">Nearest water point: <b>{nearest.name}</b> · {nearest.kind} · about {dist(nearest.km!)} (straight line)</p>
          )}
          {rounds.length > 1 && myRound && <p className="text-xs text-muted-foreground">{rounds.length} tankers out. Yours is in blue, the others are grey.</p>}
        </section>

        {/* Locality first, then a street of that locality only (type to filter). */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
            Locality
            <select className="min-h-11 w-full rounded-xl border bg-card px-2 text-base text-foreground" value={areaId ?? ""} onChange={(e) => pickArea(Number(e.target.value))}>
              {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
            Your street
            <input
              key={`${areaId}-${myId}`}
              list="area-streets"
              defaultValue={my?.area_id === areaId ? my?.name : ""}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => { const s = areaStreets.find((x) => foldName(x.name) === foldName(e.target.value)); if (s) pickStreet(s.id); }}
              placeholder="Type your street"
              className="min-h-11 w-full rounded-xl border bg-card px-2 text-base text-foreground"
            />
            <datalist id="area-streets">{areaStreets.map((s) => <option key={s.id} value={s.name} />)}</datalist>
          </label>
        </div>

        <section aria-label="Find a place" className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Find any place in Mauritius</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a place, e.g. Chamarel" className="h-11 w-full rounded-xl border bg-card pr-2 pl-9 text-base" />
            </label>
            <button type="button" onClick={locate} aria-label="Use my location" className="grid size-11 shrink-0 place-items-center rounded-xl border bg-card text-primary">
              <LocateFixed aria-hidden className="size-5" />
            </button>
          </div>
          {query.trim() && (
            !places ? <PipeLoader />
            : hits.length ? (
              <ul className="flex flex-col divide-y rounded-xl border">
                {hits.map((p) => (
                  <li key={`${p.n}|${p.l}|${p.lat}`}>
                    <button type="button" onClick={() => goTo(p)} className="min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-muted">{placeLabel(p)}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">No place called &quot;{query.trim()}&quot;.</p>
          )}
          {geoError && <p role="alert" className="text-xs text-red-800">{geoError}</p>}
          {pin && (
            <p className={`rounded-xl px-3 py-2 text-sm ${river && river.distance_m <= NEAR_RIVER_M ? "bg-sky-50 text-sky-950" : "bg-muted"}`}>
              <b>{pin.label}</b>:{" "}
              {!river ? "checking rivers…"
                : river.distance_m <= NEAR_RIVER_M ? <>near {river.name ?? `a ${river.waterway}`} (about {metres(river.distance_m)}). After heavy rain, tap water can turn cloudy and low areas can flood.</>
                : <>about {metres(river.distance_m)} from the nearest {river.waterway}{river.name ? ` (${river.name})` : ""}.</>}
            </p>
          )}
          {islandError && <p role="alert" className="text-xs text-red-800">{islandError}</p>}
        </section>

        <button type="button" className="chip min-h-11 self-start border lg:hidden" aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
          <LayersIcon aria-hidden className="size-4" /> {layersOpen ? "Hide legend" : "Legend and layers"}
        </button>

        <section className={`${layersOpen ? "flex" : "hidden"} flex-col gap-3 lg:flex`} aria-label="Map layers">
          {LAYER_INFO.map(({ key, label }) => (
            <fieldset key={key} className="flex flex-col gap-1.5 rounded-2xl border p-3">
              <label className="flex min-h-8 items-center gap-2 font-medium">
                <input type="checkbox" className="size-4 accent-primary" checked={layers[key]} onChange={() => toggle(key)} />
                {label}
              </label>
              {key === "tankers" && (
                <Legend items={[{ dot: "#f59e0b", label: "next stop" }, { dot: "#475569", label: "later stop" }, { dot: "#a1a1aa", label: "served" }]}
                  note={`${tankers.length} tanker${tankers.length === 1 ? "" : "s"} with a GPS fix.`} />
              )}
              {key === "reports" && (
                <Legend
                  items={[{ dot: "#059669", label: "water reported" }, { dot: "#e11d48", label: "no water" }, { dot: "#a1a1aa", label: "no report, 3 h" }]}
                  note={reports ? "One dot per street. Tap it for details. 📍 = your street." : "Reports are unavailable right now."}
                />
              )}
              {key === "water" && (
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5"><span aria-hidden className="grid size-4 place-items-center rounded bg-cyan-700 text-[9px] font-bold text-white">W</span> tanker stop, public standpipe or static tank. Bigger = nearest to your street.</p>
                  {waterPoints === null && <p>No sourced water points loaded yet.</p>}
                  {waterPoints?.length === 0 && <p>No sourced water points listed yet.</p>}
                  {offline && <p>Demo points, not real places.</p>}
                </div>
              )}
              {key === "localities" && (
                <Legend
                  items={[{ dot: BASIS_HEX.locality_notice, label: "CWA notice" }, { dot: BASIS_HEX.regional_timetable, label: "regional timetable" }, { dot: BASIS_HEX.unknown, label: "not known yet" }]}
                  note={layers.localities ? (localities.length ? `${localities.length} localities. Tap one for its hours.` : <PipeLoader />) : "Every town and village, by how sure its supply hours are."}
                />
              )}
              {key === "rivers" && (
                <Legend items={[{ dot: "#0284c7", label: "river or stream (OpenStreetMap)" }]} note={layers.rivers && !rivers ? <PipeLoader /> : "Search a place to see how far the nearest river is."} />
              )}
              {key === "notices" && (
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <Legend items={[{ hatch: true, label: "planned interruption" }, { dot: "#059669", label: "official supply window now" }]} />
                  {schedule === null && <p>The official timetable is unavailable right now.</p>}
                  {schedule && !plotted.length && !unplotted.length && <p>No active official notice. Expired notices are not shown.</p>}
                  {plotted.map((a) => (
                    <p key={a.area_id} className="text-foreground">
                      <b>{a.name}:</b> {a.notice.text}. {noticeTimes(a.notice)}.{" "}
                      {a.notice.source_url ? <a className="text-primary underline" href={a.notice.source_url} target="_blank" rel="noreferrer">CWA notice{a.notice.source_date ? ` of ${a.notice.source_date}` : ""}</a> : <span className="text-muted-foreground">Sample timetable (demo).</span>}
                    </p>
                  ))}
                  {unplotted.length > 0 && <p>Not on this map: {unplotted.join(", ")}.</p>}
                </div>
              )}
            </fieldset>
          ))}
        </section>

        <Link href="/resident" className="inline-flex min-h-11 items-center text-sm text-primary underline">← Back to my street</Link>
      </aside>
    </main>
  );
}

type LegendItem = { label: string; dot?: string; ring?: string; dashed?: boolean; hatch?: boolean };
function Legend({ items, note }: { items: LegendItem[]; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-3.5 shrink-0 rounded-full"
              style={
                i.hatch ? { background: "repeating-linear-gradient(45deg,#f59e0b 0 3px,#1f2937 3px 6px)" }
                : i.ring ? { border: `2px ${i.dashed ? "dashed" : "solid"} ${i.ring}` }
                : { background: i.dot }
              }
            />
            {i.label}
          </li>
        ))}
      </ul>
      {note && <div>{note}</div>}
    </div>
  );
}

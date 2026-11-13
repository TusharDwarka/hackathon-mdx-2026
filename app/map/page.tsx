"use client";

// Resident map (contracts/api.md ops 1, 8, 9; docs/NEXT-TASK-SPLIT.md P4 steps 1-4, 7).
// Several tankers can be out: the map follows the round that carries MY street and shows the others greyed.
// Layers: live tankers, resident reports (last 3 h), supply reliability (last 14 days), official notices.
// Phones: map on top, panel below. From 1024px: panel on the right. The map resizes with its container.
// My street: ?street=<id>, else localStorage "kotdelo.street" (same key as /resident), else the first street.
// Fallback: Supabase unreachable OR no streets loaded yet -> demo mode with simulated tankers.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers as LayersIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { etaMinutes } from "@/lib/eta";
import { LiveMap, type AreaNotice, type Layers, type TankerMarker } from "@/components/map/LiveMap";
import { errText, loadActiveRounds, loadAreas, loadLatestFixes, loadReports, loadSchedule, loadStreets, type Area, type Fix, type LiveRound, type Street } from "@/components/map/data";
import { areaNotice, noticeTimes, reliabilityLegend, reportSignals, streetReliability, RELIABILITY_DAYS, type ScheduleRow } from "@/components/map/layers";
import { arrived, DEMO_AREA, DEMO_STREETS, demoHistory, demoRounds, demoSchedule, simulateStep } from "@/components/map/demo";
import type { RecentReport } from "@/components/ops/rules";

const STREET_KEY = "kotdelo.street"; // shared with /resident
const STALE_MS = 2 * 60_000;
const LAYER_INFO: { key: keyof Layers; label: string }[] = [
  { key: "tankers", label: "Live tankers" },
  { key: "reports", label: "Resident reports, last 3 h" },
  { key: "reliability", label: `Supply reliability, last ${RELIABILITY_DAYS} days` },
  { key: "notices", label: "Official notices" },
];

export default function MapPage() {
  const [streets, setStreets] = useState<Street[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [rounds, setRounds] = useState<LiveRound[]>([]);
  const [fixes, setFixes] = useState<Record<number, Fix>>({});
  const [reports, setReports] = useState<RecentReport[] | null>(null); // null = layer unavailable
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [layers, setLayers] = useState<Layers>({ tankers: true, reports: true, reliability: true, notices: true });
  const [layersOpen, setLayersOpen] = useState(false); // phones only; always open from 1024px
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

  // Demo: every tanker glides to its next stop and serves it on arrival. A dispatch confirmed on /ops in
  // another tab (same browser) replaces the demo rounds.
  useEffect(() => {
    if (!offline) return;
    const pos = new Map<number, { lat: number; lng: number }>();
    const t = setInterval(() => {
      const served: { round: number; stop: number }[] = [];
      const next: Record<number, Fix> = {};
      for (const r of roundsRef.current) {
        const p = simulateStep(pos.get(r.round.id) ?? null, r.stops);
        if (!p) continue;
        pos.set(r.round.id, p);
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
    const onStorage = (e: StorageEvent) => { if (e.key === "kotdelo.demo-dispatch") { pos.clear(); setRounds(demoRounds()); } };
    window.addEventListener("storage", onStorage);
    return () => { clearInterval(t); window.removeEventListener("storage", onStorage); };
  }, [offline]);

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
  const focus = {
    key: `${myId}|${myRound?.round.id ?? "none"}|${myFix ? "fix" : "nofix"}|${streets.length}`,
    points: my ? (myFix ? [my, myFix] : [my]) : streets,
  };

  function pickStreet(id: number) {
    setMyId(id);
    try { localStorage.setItem(STREET_KEY, String(id)); } catch { /* ignore */ }
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
          layers={layers}
          focus={focus}
        />
      </div>

      <aside className="flex max-h-[55%] flex-col gap-3 overflow-y-auto bg-card p-4 shadow-card lg:max-h-none lg:w-96 lg:shrink-0">
        {offline && <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900">Demo mode: sample streets, simulated tankers. ({offline})</p>}

        <section aria-live="polite" className="flex flex-col gap-1">
          {loading ? (
            <p className="text-lg text-muted-foreground">Loading…</p>
          ) : !rounds.length ? (
            <p className="text-2xl font-bold">No tanker round right now</p>
          ) : !myRound || !myStop ? (
            <p className="text-xl font-bold">{rounds.length === 1 ? "A tanker is" : `${rounds.length} tankers are`} out, but your street is not on a round.</p>
          ) : myStop.served_at ? (
            <p className="text-2xl font-bold text-emerald-700">Tanker arrived! Served ✓</p>
          ) : (
            <>
              <p className="text-2xl font-bold">{stopsAway} stop{stopsAway > 1 ? "s" : ""} away</p>
              <p className="text-lg">{myRound.label} on the way · about {eta} min{stale ? " (GPS signal lost, estimate)" : ""}</p>
              {myLitres > 0 && <p className="text-sm text-muted-foreground">About {myLitres} L planned for your street.</p>}
              {!myFix && <p className="text-sm text-muted-foreground">Waiting for the driver&apos;s first GPS fix…</p>}
            </>
          )}
          {rounds.length > 1 && myRound && <p className="text-xs text-muted-foreground">{rounds.length} tankers out. Yours is in blue, the others are grey.</p>}
        </section>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Your street
          <select className="min-h-11 flex-1 rounded-xl border bg-card px-2 text-foreground" value={myId ?? ""} onChange={(e) => pickStreet(Number(e.target.value))}>
            {streets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <button type="button" className="chip self-start border lg:hidden" aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
          <LayersIcon aria-hidden className="size-4" /> {layersOpen ? "Hide layers" : "Map layers and legend"}
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
                  note={`${tankers.length} tanker${tankers.length === 1 ? "" : "s"} with a GPS fix. Ring = your street.`} />
              )}
              {key === "reports" && (
                reports ? (
                  <Legend
                    items={[{ ring: "#059669", label: "water is here" }, { ring: "#e11d48", label: "no water" }, { ring: "#64748b", dashed: true, label: "dashed: unconfirmed" }]}
                    note="Solid = 2+ reports that agree. One report is a street-level signal, never proof. No house pins, no names."
                  />
                ) : <p className="text-xs text-muted-foreground">Reports are unavailable right now.</p>
              )}
              {key === "reliability" && (
                reports ? (
                  <Legend items={reliabilityLegend().map((l) => ({ dot: l.hex, label: l.label }))}
                    note={`Days with a "water is here" report in the last ${RELIABILITY_DAYS} days. Past reports, not a forecast.`} />
                ) : <p className="text-xs text-muted-foreground">Reports are unavailable right now.</p>
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
                  {unplotted.length > 0 && <p>Not on this map (no streets loaded for them): {unplotted.join(", ")}.</p>}
                  <p>Area-level only: a notice does not say which street has water.</p>
                </div>
              )}
            </fieldset>
          ))}
        </section>

        <Link href="/resident" className="text-sm text-primary underline">← Back to my street</Link>
      </aside>
    </main>
  );
}

type LegendItem = { label: string; dot?: string; ring?: string; dashed?: boolean; hatch?: boolean };
function Legend({ items, note }: { items: LegendItem[]; note?: string }) {
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
      {note && <p>{note}</p>}
    </div>
  );
}

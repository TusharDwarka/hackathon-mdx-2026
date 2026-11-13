"use client";

// One Leaflet map for /map (docs/NEXT-TASK-SPLIT.md, P4 steps 1-4, 7).
// Created once; data changes only redraw layer groups, trucks move with setLatLng.
// Fills its parent: a ResizeObserver calls invalidateSize() so resize, minimize/restore and
// panel changes never leave blank tiles. Leaflet touches `window`, so it is imported in the effect.
// Layers, each separately toggled: one dot per street (water now, never house pins), your street pin,
// official notices (hatched area labels, never solid blue), live tankers (+ my tanker's stops),
// tanker stops / public water points (nearest to my street highlighted).
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Fix, Stop, Street, WaterPoint } from "@/components/map/data";
import { noticeTimes, RELIABILITY_DAYS, UNKNOWN_HEX, type Notice, type Reliability, type Signal } from "@/components/map/layers";

type Lf = typeof import("leaflet");
export type TankerMarker = { id: number; label: string; fix: Fix; mine: boolean; stale: boolean };
export type AreaNotice = { area_id: number; name: string; lat: number; lng: number; notice: Notice };
export type Layers = { reports: boolean; notices: boolean; tankers: boolean; water: boolean };
export type WaterMarker = WaterPoint & { nearest: boolean; km: number | null };
type Props = {
  streets: Street[];
  stops: Stop[]; // my tanker's route
  myStreetId: number | null;
  tankers: TankerMarker[];
  signals: Record<number, Signal>;
  reliability: Record<number, Reliability>;
  notices: AreaNotice[];
  water: WaterMarker[];
  layers: Layers;
  focus: { key: string; points: { lat: number; lng: number }[] };
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function LiveMap({ streets, stops, myStreetId, tankers, signals, reliability, notices, water, layers, focus }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const lf = useRef<Lf | null>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const groups = useRef<Record<keyof Layers | "mine", import("leaflet").LayerGroup> | null>(null);
  const trucks = useRef(new Map<number, { marker: import("leaflet").Marker; key: string }>());
  const [ready, setReady] = useState(false);

  // Create the map once and keep it sized to its container.
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => map.current?.invalidateSize({ pan: false })); };
    const onVisible = () => { if (document.visibilityState === "visible") resize(); };
    const truckMarkers = trucks.current;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      lf.current = L;
      const m = L.map(el.current, { center: [-20.3, 57.48], zoom: 15 });
      m.attributionControl.setPrefix(false);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(m);
      groups.current = { reports: L.layerGroup(), notices: L.layerGroup(), tankers: L.layerGroup(), water: L.layerGroup(), mine: L.layerGroup().addTo(m) };
      map.current = m;
      observer = new ResizeObserver(resize);
      observer.observe(el.current);
      document.addEventListener("visibilitychange", onVisible);
      setReady(true);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisible);
      truckMarkers.clear();
      map.current?.remove();
      map.current = null;
      groups.current = null;
    };
  }, []);

  // Show or hide each layer group.
  useEffect(() => {
    const m = map.current, g = groups.current;
    if (!m || !g) return;
    for (const k of Object.keys(layers) as (keyof Layers)[]) {
      if (layers[k]) g[k].addTo(m);
      else g[k].remove();
    }
  }, [ready, layers]);

  // One dot per street: water now. Green = water reported, red = no water, grey = no report in 3 h.
  useEffect(() => {
    const L = lf.current, g = groups.current?.reports;
    if (!L || !g) return;
    g.clearLayers();
    for (const s of streets) {
      const sig = signals[s.id];
      const r = reliability[s.id];
      const fill = !sig ? UNKNOWN_HEX : sig.type === "water_on" ? "#059669" : "#e11d48";
      const now = !sig ? "No report in the last 3 hours." : sig.text + (sig.context ? `. ${sig.context}` : "") + ".";
      const past = r && r.share != null ? `Water reported on ${r.days_hit} of ${r.days_total} days.` : `No reports in the last ${RELIABILITY_DAYS} days.`;
      L.circleMarker([s.lat, s.lng], { radius: 9, weight: 2, color: "#ffffff", fillColor: fill, fillOpacity: 1 })
        .bindPopup(`<b>${esc(s.name)}</b><br>${esc(now)}<br>${esc(past)}`)
        .addTo(g);
    }
  }, [ready, streets, signals, reliability]);

  // Step 3: official notices as hatched labels at the area's centre. No invented boundary.
  useEffect(() => {
    const L = lf.current, g = groups.current?.notices;
    if (!L || !g) return;
    g.clearLayers();
    for (const a of notices) {
      const cut = a.notice.kind === "interruption";
      const swatch = cut ? "background:repeating-linear-gradient(45deg,#f59e0b 0 5px,#1f2937 5px 10px)" : "background:#059669";
      const html = `<div style="display:flex;align-items:center;gap:6px;width:max-content;max-width:220px;padding:4px 10px 4px 4px;border-radius:999px;background:#fff;box-shadow:0 2px 8px rgb(0 0 0/.25);font:600 12px/1.2 system-ui,sans-serif;color:#1f2937">
        <span style="flex:none;width:22px;height:22px;border-radius:999px;${swatch}"></span>${esc(a.name)} · ${cut ? "planned interruption" : "supply window"}</div>`;
      const source = a.notice.source_url ? `<a href="${esc(a.notice.source_url)}" target="_blank" rel="noreferrer">CWA notice${a.notice.source_date ? ` of ${esc(a.notice.source_date)}` : ""}</a>` : "Sample timetable (demo), no source";
      L.marker([a.lat, a.lng], { icon: L.divIcon({ html, className: "", iconSize: [0, 0], iconAnchor: [0, 15] }), zIndexOffset: 500, keyboard: true, title: `${a.name}: ${a.notice.text}` })
        .bindPopup(`<b>${esc(a.name)}</b><br>${esc(a.notice.text)}<br>${esc(noticeTimes(a.notice))}<br>Expires ${esc(a.notice.to.toLocaleString("en-GB"))}<br>${source}<br><small>Area-level notice: it does not say which streets have water.</small>`)
        .addTo(g);
    }
  }, [ready, notices]);

  // Water-day split item 4: tanker stops / public water points. Square tap icon; the nearest one is larger with a label.
  useEffect(() => {
    const L = lf.current, g = groups.current?.water;
    if (!L || !g) return;
    g.clearLayers();
    for (const p of water) {
      const size = p.nearest ? 30 : 22;
      const html = `<div style="display:flex;align-items:center;gap:4px;width:max-content">
        <span style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:8px;background:#0e7490;color:#fff;font:700 ${p.nearest ? 15 : 12}px system-ui,sans-serif;box-shadow:0 0 0 ${p.nearest ? 4 : 2}px #fff,0 2px 6px rgb(0 0 0/.35)">W</span>
        ${p.nearest ? `<span style="padding:2px 8px;border-radius:999px;background:#0e7490;color:#fff;font:600 12px system-ui,sans-serif">nearest water point</span>` : ""}</div>`;
      const dist = p.km != null ? `<br>About ${p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1)} km`} from your street (straight line)` : "";
      const source = p.source_url ? `<br><a href="${esc(p.source_url)}" target="_blank" rel="noreferrer">source</a>` : "<br>Demo point, not a real place";
      L.marker([p.lat, p.lng], { icon: L.divIcon({ html, className: "", iconSize: [0, 0], iconAnchor: [size / 2, size / 2] }), zIndexOffset: p.nearest ? 700 : 400, title: p.name })
        .bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.kind)}${dist}${source}`)
        .addTo(g);
    }
  }, [ready, water]);

  // Step 7: my tanker's stops (next = amber, served = grey).
  useEffect(() => {
    const L = lf.current, g = groups.current?.tankers;
    if (!L || !g) return;
    g.eachLayer((l) => { if (!(l instanceof L.Marker)) g.removeLayer(l); });
    const next = stops.find((s) => !s.served_at);
    for (const s of stops) {
      const color = s.served_at ? "#a1a1aa" : s.id === next?.id ? "#f59e0b" : "#475569";
      L.circleMarker([s.street.lat, s.street.lng], { radius: 5, weight: 2, color: "#ffffff", fillColor: color, fillOpacity: 1 })
        .bindTooltip(esc(`Stop ${s.stop_order}. ${s.street.name}${s.litres ? ` · ${s.litres} L` : ""}${s.served_at ? " · served" : s.id === next?.id ? " · next" : ""}`))
        .addTo(g);
    }
  }, [ready, stops]);

  // My street: a pin on the street point (street level, not a house).
  useEffect(() => {
    const L = lf.current, g = groups.current?.mine;
    if (!L || !g) return;
    g.clearLayers();
    const s = streets.find((x) => x.id === myStreetId);
    if (s) L.marker([s.lat, s.lng], { icon: L.divIcon({ html: `<div style="font-size:30px;line-height:30px;filter:drop-shadow(0 2px 2px rgb(0 0 0/.4))">📍</div>`, className: "", iconSize: [30, 30], iconAnchor: [15, 29] }), zIndexOffset: 900, title: `Your street: ${s.name}` }).addTo(g);
  }, [ready, streets, myStreetId]);

  // Live tankers: reuse each marker, move it with setLatLng, swap the icon only when its label changes.
  useEffect(() => {
    const L = lf.current, g = groups.current?.tankers;
    if (!L || !g) return;
    const live = new Set(tankers.map((t) => t.id));
    for (const [id, t] of trucks.current) if (!live.has(id)) { g.removeLayer(t.marker); trucks.current.delete(id); }
    for (const t of tankers) {
      const key = `${t.label}|${t.mine}|${t.stale}`;
      const icon = () => L.divIcon({
        className: "",
        iconSize: [0, 0],
        iconAnchor: [16, 16],
        html: `<div style="display:flex;align-items:center;gap:4px;width:max-content;${t.mine ? "" : "opacity:.65;filter:grayscale(1)"}">
          <span style="font-size:28px;line-height:32px">🚚</span><span style="padding:2px 8px;border-radius:999px;font:600 12px system-ui,sans-serif;background:${t.mine ? "#1d4ed8" : "#fff"};color:${t.mine ? "#fff" : "#1f2937"};box-shadow:0 1px 4px rgb(0 0 0/.3)">${esc(t.label)}${t.mine ? " · yours" : ""}${t.stale ? " · GPS lost" : ""}</span></div>`,
      });
      const have = trucks.current.get(t.id);
      if (!have) {
        const marker = L.marker([t.fix.lat, t.fix.lng], { icon: icon(), zIndexOffset: t.mine ? 1000 : 800, title: t.label }).addTo(g);
        trucks.current.set(t.id, { marker, key });
      } else {
        have.marker.setLatLng([t.fix.lat, t.fix.lng]);
        if (have.key !== key) { have.marker.setIcon(icon()); have.marker.setZIndexOffset(t.mine ? 1000 : 800); have.key = key; }
      }
    }
  }, [ready, tankers]);

  // Fit the view when the parent asks (first load, street change, my tanker's first fix).
  const focusKey = focus.key;
  const points = useRef(focus.points);
  useEffect(() => { points.current = focus.points; });
  useEffect(() => {
    const L = lf.current, m = map.current, pts = points.current;
    if (!L || !m || !pts.length) return;
    const animate = !reducedMotion();
    if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 16, { animate });
    else m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16, animate });
  }, [ready, focusKey]);

  return <div ref={el} className="absolute inset-0 isolate bg-muted [&_.leaflet-tile-pane]:opacity-75 [&_.leaflet-tile-pane]:grayscale" />;
}

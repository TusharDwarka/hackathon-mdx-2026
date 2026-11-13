"use client";

// Step 8 heat map: one dot per street, coloured by hours since the last "water_on"
// report (contracts/api.md op 11). A still picture, not a second interactive map:
// drag and zoom are off so it never traps the page scroll on a phone. The list
// under it on Home carries the same data as text.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Street } from "@/lib/queries";

const NO_REPORT = "#a1a1aa";
const BINS = [
  { under: 6, hex: "#059669", label: "under 6 h" },
  { under: 24, hex: "#f59e0b", label: "6 to 24 h" },
  { under: 48, hex: "#ea580c", label: "1 to 2 days" },
  { under: Infinity, hex: "#dc2626", label: "over 2 days" },
];
export const HEAT_LEGEND = [...BINS.map(({ hex, label }) => ({ hex, label })), { hex: NO_REPORT, label: "no reports" }];
/** Shared by the map dots and the list swatches. null = no water_on report yet. */
export const heatHex = (hours: number | null | undefined) => (hours == null ? NO_REPORT : BINS.find((b) => hours < b.under)!.hex);

type Props = { streets: Street[]; hoursDry: Record<number, number | null>; myStreetId: number | null };

export function HeatMap({ streets, hoursDry, myStreetId }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapVersion, setMapVersion] = useState(0); // bumps when a (new) map is ready for dots

  // Create the map once, fitted to the streets. Leaflet touches `window`, so it is imported here.
  useEffect(() => {
    if (!streets.length) return;
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false });
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      map.fitBounds(L.latLngBounds(streets.map((s) => [s.lat, s.lng])), { padding: [28, 28], maxZoom: 16 });
      leaflet.current = L;
      layer.current = L.layerGroup().addTo(map);
      setMapVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
      map?.remove();
      layer.current = null;
    };
  }, [streets]);

  // Redraw the dots when the hours or my street change (a "Water is here" tap turns my street green).
  useEffect(() => {
    const L = leaflet.current;
    if (!L || !layer.current) return;
    layer.current.clearLayers();
    for (const s of streets) {
      const mine = s.id === myStreetId;
      L.circleMarker([s.lat, s.lng], { radius: mine ? 11 : 8, weight: mine ? 3 : 2, color: mine ? "#0f172a" : "#ffffff", fillColor: heatHex(hoursDry[s.id]), fillOpacity: 1 }).addTo(layer.current);
    }
  }, [mapVersion, streets, hoursDry, myStreetId]);

  return <div ref={el} aria-hidden className="isolate h-44 overflow-hidden rounded-lg bg-muted [&_.leaflet-tile-pane]:opacity-70 [&_.leaflet-tile-pane]:grayscale" />;
}

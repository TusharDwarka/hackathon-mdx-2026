"use client";

// Leaflet map: stop markers (mine = blue, next = amber, served = grey) and the
// truck marker that moves when `fix` changes. Leaflet touches `window`, so it
// is imported inside the effect, never at module level.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Fix, Stop } from "@/components/map/data";

type L = typeof import("leaflet");
type Props = { stops: Stop[]; myStreetId: number | null; fix: Fix | null; center: { lat: number; lng: number } };

export function TruckMap({ stops, myStreetId, fix, center }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const leaflet = useRef<L | null>(null);
  const truck = useRef<import("leaflet").Marker | null>(null);
  const stopLayer = useRef<import("leaflet").LayerGroup | null>(null);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false); // Leaflet loaded: lets the effects below run

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((Lmod) => {
      if (cancelled || !el.current || map.current) return;
      leaflet.current = Lmod;
      map.current = Lmod.map(el.current).setView([center.lat, center.lng], 15);
      Lmod.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map.current);
      stopLayer.current = Lmod.layerGroup().addTo(map.current);
      setReady(true);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw stops when they change (served flips grey, next turns amber).
  useEffect(() => {
    const Lmod = leaflet.current, layer = stopLayer.current;
    if (!Lmod || !layer) return;
    layer.clearLayers();
    const next = stops.find((s) => !s.served_at);
    for (const s of stops) {
      const mine = s.street_id === myStreetId;
      const color = s.served_at ? "#a1a1aa" : mine ? "#0284c7" : s.id === next?.id ? "#f59e0b" : "#64748b";
      Lmod.circleMarker([s.street.lat, s.street.lng], { radius: mine ? 10 : 6, color, fillColor: color, fillOpacity: 0.8 })
        .bindTooltip(`${s.stop_order}. ${s.street.name}${s.served_at ? " · served" : ""}`)
        .addTo(layer);
    }
  }, [ready, stops, myStreetId]);

  // Move the truck.
  useEffect(() => {
    const Lmod = leaflet.current, m = map.current;
    if (!Lmod || !m) return;
    if (!fix) { truck.current?.remove(); truck.current = null; fitted.current = false; return; }
    if (!truck.current) {
      truck.current = Lmod.marker([fix.lat, fix.lng], { icon: Lmod.divIcon({ html: "🚚", className: "text-3xl", iconSize: [32, 32] }) }).addTo(m);
    } else {
      truck.current.setLatLng([fix.lat, fix.lng]);
    }
    if (!fitted.current) {
      fitted.current = true;
      m.fitBounds(Lmod.latLngBounds([[fix.lat, fix.lng], [center.lat, center.lng]]), { padding: [40, 40], maxZoom: 16 });
    }
  }, [ready, fix, center]);

  return <div ref={el} className="flex-1" />;
}

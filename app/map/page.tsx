"use client";

// MOCKUP: the truck is simulated along the mock streets. Replace the timer
// with Supabase Realtime on truck_positions.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { etaMinutes } from "@/lib/eta";
import { MOCK_STREETS } from "@/lib/mock";

const MY_STREET = MOCK_STREETS[2]; // matches Home's default street
const SEG = 10; // simulated points between two streets
const PATH = MOCK_STREETS.flatMap((s, i) => {
  const n = MOCK_STREETS[i + 1];
  if (!n) return [s];
  return Array.from({ length: SEG }, (_, k) => ({ lat: s.lat + ((n.lat - s.lat) * k) / SEG, lng: s.lng + ((n.lng - s.lng) * k) / SEG }));
});

export default function MapPage() {
  const el = useRef<HTMLDivElement>(null);
  const truckRef = useRef<import("leaflet").Marker | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current).setView([MY_STREET.lat, MY_STREET.lng], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      MOCK_STREETS.forEach((s) =>
        L.circleMarker([s.lat, s.lng], { radius: s.id === MY_STREET.id ? 10 : 6, color: s.id === MY_STREET.id ? "#0284c7" : "#64748b" })
          .bindTooltip(s.name).addTo(map!)
      );
      truckRef.current = L.marker([PATH[0].lat, PATH[0].lng], {
        icon: L.divIcon({ html: "🚚", className: "text-3xl", iconSize: [32, 32] }),
      }).addTo(map);
    });
    const t = setInterval(() => setStep((s) => Math.min(s + 1, PATH.length - 1)), 1000);
    return () => { cancelled = true; clearInterval(t); map?.remove(); };
  }, []);

  const pos = PATH[step];
  useEffect(() => { truckRef.current?.setLatLng([pos.lat, pos.lng]); }, [pos]);

  // Street k (0-based) is reached at step k*SEG. Next stop = first street not yet reached.
  const nextIdx = Math.ceil(step / SEG);
  const stopsAway = Math.max(0, MY_STREET.order_index - nextIdx);
  const next = MOCK_STREETS[Math.min(nextIdx, MOCK_STREETS.length - 1)];
  // Simulated fix is always fresh (recordedAt = now = 0). Real data: pass recorded_at and Date.now() from an effect.
  const eta = etaMinutes({ ...pos, recordedAt: 0 }, next, stopsAway, 0);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[390px] flex-col">
      <div ref={el} className="flex-1" />
      <section className="flex flex-col gap-1 border-t bg-white p-4">
        <p className="text-xs text-yellow-800">MOCKUP: simulated truck</p>
        {stopsAway > 0 ? (
          <>
            <p className="text-2xl font-bold">{stopsAway} stop{stopsAway > 1 ? "s" : ""} away</p>
            <p className="text-lg">Kamion pe vini · about {eta} min</p>
          </>
        ) : (
          <p className="text-2xl font-bold text-emerald-700">Kamion inn ariv! Served ✓</p>
        )}
        <p className="text-sm text-zinc-500">Your street: {MY_STREET.name}</p>
        <Link href="/" className="text-sm text-sky-700 underline">← Back</Link>
      </section>
    </main>
  );
}

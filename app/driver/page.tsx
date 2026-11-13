"use client";

// MOCKUP: local state only. Wire Start/Served/End to rounds, round_stops,
// truck_positions (watchPosition every 5s + Wake Lock).
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MOCK_STREETS } from "@/lib/mock";

const WAITING = MOCK_STREETS.filter((s) => s.id !== 1); // streets with waiting requests (mock)

export default function DriverPage() {
  const [active, setActive] = useState(false);
  const [served, setServed] = useState<number[]>([]);

  return (
    <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 p-4">
      <p className="rounded bg-yellow-100 px-2 py-1 text-center text-xs text-yellow-900">MOCKUP: no GPS sent yet</p>
      <h1 className="text-2xl font-bold">Tanker driver</h1>

      {!active ? (
        <Button className="h-16 text-lg" onClick={() => { setActive(true); setServed([]); }}>Start round · {WAITING.length} stops</Button>
      ) : (
        <>
          <p className="text-sm text-emerald-700">● Sharing location (only during the round)</p>
          <ol className="flex flex-col gap-2">
            {WAITING.map((s, i) => {
              const done = served.includes(s.id);
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="w-6 text-center font-bold">{i + 1}</span>
                  <span className={`flex-1 ${done ? "text-zinc-400 line-through" : ""}`}>{s.name}</span>
                  <Button className="h-12" variant={done ? "outline" : "default"} disabled={done} onClick={() => setServed([...served, s.id])}>
                    {done ? "Served ✓" : "Served"}
                  </Button>
                </li>
              );
            })}
          </ol>
          <Button className="h-14" variant="destructive" onClick={() => setActive(false)}>End round</Button>
        </>
      )}
      <Link href="/" className="text-center text-sm text-zinc-500">Home</Link>
    </main>
  );
}

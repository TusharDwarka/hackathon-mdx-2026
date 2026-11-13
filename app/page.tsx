"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SurpriseCard } from "@/components/home/SurpriseCard";
import { MOCK_AREA, MOCK_HOURS_DRY, MOCK_RELIABILITY, MOCK_STREETS, MOCK_WINDOW } from "@/lib/mock";

// Heat colour: hours since last water_on report
const heat = (h: number) => (h < 6 ? "bg-emerald-500" : h < 24 ? "bg-amber-400" : h < 48 ? "bg-orange-500" : "bg-red-600");

function Label({ text }: { text: string }) {
  return <span className="font-semibold">{text}</span>;
}

export default function Home() {
  const [streetId, setStreetId] = useState(MOCK_STREETS[2].id);
  const [reported, setReported] = useState(false);
  const [requested, setRequested] = useState(false);
  const street = MOCK_STREETS.find((s) => s.id === streetId)!;

  return (
    <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 p-4">
      <p className="rounded bg-yellow-100 px-2 py-1 text-center text-xs text-yellow-900">MOCKUP: fake data until the real CWA timetable is loaded</p>

      <header>
        <h1 className="text-3xl font-bold">Kot Delo?</h1>
        <p className="text-sm text-zinc-500">Where is the water? · {MOCK_AREA.name}</p>
      </header>

      <label className="flex flex-col gap-1">
        <Label text="Which street do you live on?" />
        <select className="h-12 rounded-lg border px-3 text-base" value={streetId} onChange={(e) => setStreetId(Number(e.target.value))}>
          {MOCK_STREETS.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <section className="rounded-xl border bg-sky-50 p-4">
        <Label text="Today's official CWA water window" />
        <p className="mt-2 text-4xl font-bold tabular-nums">{MOCK_WINDOW.start_time} – {MOCK_WINDOW.end_time}</p>
        <a href={MOCK_WINDOW.source_url} className="text-xs text-sky-700 underline">Source: CWA communiqué, {MOCK_WINDOW.source_date}</a>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button className="h-16 bg-emerald-600 hover:bg-emerald-700" onClick={() => setReported(true)}>
          <Label text="Water is here" />
        </Button>
        <Button className="h-16 bg-red-600 hover:bg-red-700" onClick={() => setReported(true)}>
          <Label text="No water" />
        </Button>
      </div>
      {reported && <p className="text-center text-sm text-zinc-600">Thanks! Reported for {street.name}.</p>}

      <Button className="h-16 text-lg" disabled={requested} onClick={() => setRequested(true)}>
        <Label text="I need water (request the tanker)" />
      </Button>
      {requested && (
        <Link href="/map" className="rounded-xl border-2 border-sky-600 p-3 text-center font-semibold text-sky-700">
          Tanker on the way → see it live
        </Link>
      )}

      <SurpriseCard />

      <section className="rounded-xl border p-4">
        <Label text="Schedule vs reality" />
        <p className="mt-2 text-2xl font-bold">On time {MOCK_RELIABILITY.onTime} of {MOCK_RELIABILITY.days} days</p>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: MOCK_RELIABILITY.days }, (_, i) => (
            <span key={i} className={`h-3 flex-1 rounded ${i < MOCK_RELIABILITY.onTime ? "bg-emerald-500" : "bg-red-400"}`} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <Label text="Hours without water, by street" />
        <ul className="mt-2 flex flex-col gap-2">
          {MOCK_STREETS.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className={`h-4 w-4 rounded ${heat(MOCK_HOURS_DRY[s.id])}`} />
              <span className="flex-1">{s.name}</span>
              <span className="tabular-nums">{MOCK_HOURS_DRY[s.id]} h</span>
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex justify-center gap-4 pb-4 text-sm text-zinc-500">
        <Link href="/map">Map</Link>
        <Link href="/driver">Driver</Link>
      </nav>
    </main>
  );
}

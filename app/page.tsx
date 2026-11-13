"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { SurpriseCard } from "@/components/home/SurpriseCard";
import { supabase } from "@/lib/supabase";
import { MOCK_AREA, MOCK_HOURS_DRY, MOCK_STREETS, MOCK_WINDOW } from "@/lib/mock";

// Heat colour: hours since last water_on report
const heat = (h: number) => (h < 6 ? "bg-emerald-500" : h < 24 ? "bg-amber-400" : h < 48 ? "bg-orange-500" : "bg-red-600");

const STREET_KEY = "kotdelo.street"; // localStorage: the resident's street id (read by /map too)
const hhmm = (t: string) => t.slice(0, 5); // Postgres time comes back as "05:00:00"
const noSubscribe = () => () => {};

const REPORT_TYPES = ["water_on", "water_off"] as const; // reports.type in contracts/api.md
type ReportType = (typeof REPORT_TYPES)[number];
const REPORT_LABEL: Record<ReportType, string> = { water_on: "Water is here", water_off: "No water" };
type RequestStatus = "waiting" | "served"; // requests.status in contracts/api.md

// Same shape as getReliability() in P3's lib/queries.ts (op 10): one entry per past day with a window.
type Reliability = { onTime: number; days: number; perDay: { date: string; onTime: boolean }[] };

// ponytail: FAKE op 10 until lib/queries.ts is on main, then `await getReliability(streetId)`.
// Last 7 days, later streets worse; street 3 gives "4 of 7".
function fakeReliability(streetId: number): Reliability {
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i));
    return { date: d.toLocaleDateString("en-CA"), onTime: (i * 3) % 7 >= streetId }; // en-CA = YYYY-MM-DD
  });
  return { onTime: perDay.filter((p) => p.onTime).length, days: perDay.length, perDay };
}

function Label({ text }: { text: string }) {
  return <span className="font-semibold">{text}</span>;
}

export default function Home() {
  // false on the server and the first hydration pass, true after. The page is prerendered,
  // so browser-only values (saved street, today's date) wait for it to avoid a hydration mismatch.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [picked, setPicked] = useState<number | null>(null);
  const saved = mounted ? Number(localStorage.getItem(STREET_KEY)) : 0;
  const street = MOCK_STREETS.find((s) => s.id === (picked ?? saved)) ?? MOCK_STREETS[2];
  const today = mounted ? new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Indian/Mauritius" }) : "";
  const [reported, setReported] = useState<ReportType | null>(null);
  const [request, setRequest] = useState<RequestStatus | null>(null);
  const reliability = mounted ? fakeReliability(street.id) : null; // needs today's date: browser only
  const pickStreet = (id: number) => {
    setPicked(id);
    setReported(null);
    setRequest(null);
    localStorage.setItem(STREET_KEY, String(id));
  };
  const report = async (type: ReportType) => {
    if (type === reported) return; // same answer tapped twice: no duplicate row
    setReported(type); // optimistic: the tap always answers
    // op 2. ponytail: inline insert until P3 ships lib/queries.ts. A failed insert (no Supabase
    // yet, mock street ids) is only logged so the demo never breaks; show an error if it must be real.
    const { error } = await supabase.from("reports").insert({ street_id: street.id, type });
    if (error) console.warn("report not saved:", error.message);
  };

  // Status of the latest request for my street (requests are per street, never per household),
  // kept live by Realtime: it flips to "served" when the driver serves the stop (op 6).
  const streetId = street.id;
  useEffect(() => {
    let current = true;
    const load = async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // ignore old rounds
      const { data, error } = await supabase.from("requests").select("status").eq("street_id", streetId).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
      if (current && !error) setRequest(data[0]?.status ?? null); // on error keep what is shown
    };
    load();
    const channel = supabase
      .channel(`requests-${streetId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `street_id=eq.${streetId}` }, load)
      .subscribe();
    return () => {
      current = false;
      supabase.removeChannel(channel);
    };
  }, [streetId]);
  const requestWater = async () => {
    setRequest("waiting"); // optimistic, same fallback as report()
    const { error } = await supabase.from("requests").insert({ street_id: streetId }); // op 3, status defaults to 'waiting'
    if (error) console.warn("request not saved:", error.message);
  };

  return (
    <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 p-4">
      <p className="rounded bg-yellow-100 px-2 py-1 text-center text-xs text-yellow-900">MOCKUP: fake data until the real CWA timetable is loaded</p>

      <header>
        <h1 className="text-3xl font-bold">Kot Delo?</h1>
        <p className="text-sm text-zinc-500">Where is the water? · {MOCK_AREA.name}</p>
      </header>

      <label className="flex flex-col gap-1">
        <Label text="Which street do you live on?" />
        <select className="h-12 rounded-lg border px-3 text-base" value={street.id} onChange={(e) => pickStreet(Number(e.target.value))}>
          {MOCK_STREETS.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <section className="rounded-xl border bg-sky-50 p-4">
        <Label text="Today's official CWA water window" />
        <p className="min-h-5 text-sm text-zinc-600">{MOCK_AREA.name}{today && ` · ${today}`}</p>
        <p className="mt-2 text-4xl font-bold tabular-nums">{hhmm(MOCK_WINDOW.start_time)} – {hhmm(MOCK_WINDOW.end_time)}</p>
        <a href={MOCK_WINDOW.source_url} target="_blank" rel="noreferrer" className="inline-block py-2 text-xs text-sky-700 underline">
          Source: CWA communiqué, {MOCK_WINDOW.source_date}
        </a>
      </section>

      <div className="grid grid-cols-2 gap-3">
        {REPORT_TYPES.map((type) => (
          <Button
            key={type}
            aria-pressed={reported === type}
            className={`h-16 aria-pressed:ring-4 aria-pressed:ring-zinc-900/30 ${type === "water_on" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
            onClick={() => report(type)}
          >
            <Label text={(reported === type ? "✓ " : "") + REPORT_LABEL[type]} />
          </Button>
        ))}
      </div>
      {reported && (
        <p role="status" className="text-center text-sm text-zinc-600">
          Thanks! Reported &quot;{REPORT_LABEL[reported]}&quot; for {street.name}.
        </p>
      )}

      <Button className="h-16 text-lg" disabled={request === "waiting"} onClick={requestWater}>
        <Label text="I need water (request the tanker)" />
      </Button>
      {request && (
        <div role="status" className="flex flex-col text-center font-semibold">
          {request === "waiting" ? (
            <Link href="/map" className="rounded-xl border-2 border-sky-600 p-3 text-sky-700">
              Waiting for the tanker · {street.name} → see it live
            </Link>
          ) : (
            <p className="rounded-xl border-2 border-emerald-600 p-3 text-emerald-700">Served · the tanker has delivered to {street.name}</p>
          )}
        </div>
      )}

      <SurpriseCard />

      <section className="rounded-xl border p-4">
        <Label text="Schedule vs reality" />
        {reliability && (
          <>
            <p className="mt-2 text-2xl font-bold">On time {reliability.onTime} of {reliability.days} days</p>
            <p className="text-sm text-zinc-600">Days when neighbours on {street.name} reported water inside the official window.</p>
            <ol className="mt-3 flex gap-1">
              {reliability.perDay.map((d) => (
                <li key={d.date} className="flex flex-1 flex-col items-center gap-1 text-xs text-zinc-600">
                  <span aria-hidden className={`flex h-8 w-full items-center justify-center rounded font-bold text-white ${d.onTime ? "bg-emerald-600" : "bg-red-500"}`}>
                    {d.onTime ? "✓" : "✕"}
                  </span>
                  {new Date(`${d.date}T00:00`).toLocaleDateString("en-GB", { weekday: "short" })}
                  <span className="sr-only">{d.onTime ? "on time" : "late or no water"}</span>
                </li>
              ))}
            </ol>
          </>
        )}
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

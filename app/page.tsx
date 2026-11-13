"use client";

// Home (contracts/api.md ops 1, 2, 3, 10, 11), real data through lib/queries.ts.
// Fallback (golden rule): database unreachable, or no streets loaded yet -> demo
// mode on lib/mock.ts with a visible banner, so the screen never breaks live.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, ChevronRight, Droplet, DropletOff, ExternalLink, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayTrack, type TodayReport } from "@/components/home/DayTrack";
import { HEAT_LEGEND, HeatMap, heatHex } from "@/components/home/HeatMap";
import { SurpriseCard } from "@/components/home/SurpriseCard";
import { minOfDay, windowStatus } from "@/components/home/time";
import { supabase } from "@/lib/supabase";
import { getAreas, getHoursDry, getReliability, getStreets, getTodayWindow, postReport, postRequest, type Reliability, type ReportType, type Street, type Window } from "@/lib/queries";
import { MOCK_AREA, MOCK_HOURS_DRY, MOCK_STREETS, MOCK_WINDOW } from "@/lib/mock";

type RequestStatus = "waiting" | "served"; // requests.status in contracts/api.md
type Base = { streets: Street[]; areaNames: Record<number, string>; hoursDry: Record<number, number | null>; demo: boolean };
type StreetData = { id: number; failed?: boolean; win: Window | null; reliability: Reliability; reports: TodayReport[] };

const REPORTS = [
  { type: "water_on", label: "Water is here", Icon: Droplet, style: "border-emerald-700/25 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-700 aria-pressed:text-white" },
  { type: "water_off", label: "No water", Icon: DropletOff, style: "border-red-700/25 bg-red-50 text-red-900 hover:bg-red-100 aria-pressed:border-red-700 aria-pressed:bg-red-700 aria-pressed:text-white" },
] as const;
const REPORT_LABEL = { water_on: "Water is here", water_off: "No water" };

const card = "rounded-xl border bg-card p-4";
// New status lines ease in instead of popping (CSS @starting-style, interruptible, no movement if reduced motion).
const enter = "transition-[opacity,translate] duration-200 ease-snap starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0";

// The resident's street id. /map gets it through the ?street= link below.
const STREET_KEY = "kotdelo.street";
const readStreet = () => {
  try { return Number(localStorage.getItem(STREET_KEY)); } catch { return 0; } // private mode
};
const saveStreet = (id: number) => {
  try { localStorage.setItem(STREET_KEY, String(id)); } catch { /* private mode */ }
};

// A clock that re-renders every 30 s. 0 on the server and the first hydration pass:
// the page is prerendered, so anything that needs "now" waits for the browser.
const TICK = 30_000;
const subscribeClock = (onTick: () => void) => {
  const t = setInterval(onTick, TICK);
  return () => clearInterval(t);
};
const clockSnapshot = () => Math.floor(Date.now() / TICK);

// ---------- demo mode data (lib/mock.ts + deterministic fakes) ----------

const DEMO: Base = { streets: MOCK_STREETS, areaNames: { [MOCK_AREA.id]: MOCK_AREA.name }, hoursDry: MOCK_HOURS_DRY, demo: true };
const EMPTY_RELIABILITY: Reliability = { onTime: 0, days: 0, perDay: [] };

function demoStreetData(id: number): StreetData {
  const at = (daysAgo: number, hour = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
    return d;
  };
  // Later streets are worse; street 3 gives "4 of 7".
  const perDay = Array.from({ length: 7 }, (_, i) => ({ date: at(7 - i).toLocaleDateString("en-CA"), onTime: (i * 3) % 7 >= id })); // en-CA = YYYY-MM-DD
  const reports = [5.2, 5.9, 6.4, 7.6, 8.8]
    .map((hour, i) => ({ type: (i * 2 + id) % 3 === 0 ? ("water_on" as const) : ("water_off" as const), created_at: at(0, hour) }))
    .filter((r) => r.created_at.getTime() < Date.now())
    .map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
  return { id, win: MOCK_WINDOW, reliability: { onTime: perDay.filter((p) => p.onTime).length, days: perDay.length, perDay }, reports };
}

// Today's reports for one street, for the day track. Not in lib/queries.ts (P3 may move it there).
async function getTodayReports(streetId: number): Promise<TodayReport[]> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.from("reports").select("type,created_at").eq("street_id", streetId).gte("created_at", midnight.toISOString()).order("created_at");
  if (error) throw error;
  return (data ?? []) as TodayReport[];
}

const fmtHours = (h: number | null | undefined) => (h == null ? "no reports yet" : h < 1 ? "under 1 h" : `${Math.round(h)} h`);
const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00`).toLocaleDateString("en-GB", opts);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted motion-reduce:animate-none ${className}`} />;
}

export default function Home() {
  const tick = useSyncExternalStore(subscribeClock, clockSnapshot, () => 0);
  const now = tick ? new Date(tick * TICK) : null;
  const [base, setBase] = useState<Base | null>(null); // null = loading
  const [picked, setPicked] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<StreetData | null>(null);
  const [reported, setReported] = useState<ReportType | null>(null);
  const [request, setRequest] = useState<RequestStatus | null>(null);
  const [sendError, setSendError] = useState<"report" | "request" | null>(null);

  // Streets, area names and the heat map numbers: once.
  useEffect(() => {
    let current = true;
    // A dead network can hang for a long time before it fails: after 4 s go to demo mode instead.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("database did not answer in 4 s")), 4000));
    Promise.race([Promise.all([getStreets(), getAreas(), getHoursDry()]), timeout])
      .then(([streets, areas, hoursDry]): Base => {
        if (!streets.length) throw new Error("no streets loaded yet");
        return { streets, areaNames: Object.fromEntries(areas.map((a) => [a.id, a.name])), hoursDry, demo: false };
      })
      .catch((e) => {
        console.warn("Home is in demo mode:", e instanceof Error ? e.message : e);
        return DEMO;
      })
      .then((b) => {
        if (current) setBase(b);
      });
    return () => {
      current = false;
    };
  }, []);

  const street = base?.streets.find((s) => s.id === (picked ?? readStreet())) ?? null;
  const streetId = street?.id ?? null;
  const demo = base?.demo ?? false;
  const data = loaded !== null && loaded.id === streetId ? loaded : null; // null = loading this street

  // Per street: today's window (op 1), reliability (op 10), today's reports.
  useEffect(() => {
    if (streetId === null) return;
    let current = true;
    const load: Promise<StreetData> = demo
      ? Promise.resolve(demoStreetData(streetId))
      : Promise.all([getTodayWindow(streetId), getReliability(streetId), getTodayReports(streetId)]).then(([win, reliability, reports]) => ({ id: streetId, win, reliability, reports }));
    load
      .catch((e): StreetData => {
        console.warn("street data not loaded:", e);
        return { id: streetId, failed: true, win: null, reliability: EMPTY_RELIABILITY, reports: [] };
      })
      .then((d) => {
        if (current) setLoaded(d);
      });
    return () => {
      current = false;
    };
  }, [streetId, demo]);

  // Latest request for my street in the last 24 h (requests are per street, never per household),
  // kept live by Realtime: it flips to "served" when the driver serves the stop (op 6).
  useEffect(() => {
    if (streetId === null || demo) return;
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
  }, [streetId, demo]);

  const pickStreet = (id: number) => {
    setPicked(id);
    setReported(null);
    setRequest(null);
    setSendError(null);
    saveStreet(id);
  };

  // Op 2. The tap answers at once; if the save fails we say so and undo it. Demo mode stays local.
  const report = async (type: ReportType) => {
    if (!street || type === reported) return; // same answer twice: no duplicate row
    const before = reported;
    setReported(type);
    setSendError(null);
    try {
      if (!demo) await postReport(street.id, type);
    } catch (e) {
      console.warn("report not saved:", e);
      setReported(before);
      setSendError("report");
      return;
    }
    // My own report shows on today's track and the heat map straight away.
    setLoaded((d) => (d && d.id === street.id ? { ...d, reports: [...d.reports, { type, created_at: new Date().toISOString() }] } : d));
    if (type === "water_on") setBase((b) => b && { ...b, hoursDry: { ...b.hoursDry, [street.id]: 0 } });
  };

  // Op 3, same pattern.
  const requestWater = async () => {
    if (!street) return;
    const before = request;
    setRequest("waiting");
    setSendError(null);
    try {
      if (!demo) await postRequest(street.id);
    } catch (e) {
      console.warn("request not saved:", e);
      setRequest(before);
      setSendError("request");
    }
  };

  const areaName = base ? (base.areaNames[street?.area_id ?? base.streets[0].area_id] ?? "") : "";
  const today = now?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const win = data?.win ?? null;
  const status = win && now ? windowStatus(win.start_time, win.end_time, minOfDay(now)) : null;
  const saidOn = data?.reports.filter((r) => r.type === "water_on").length ?? 0;
  const saidOff = (data?.reports.length ?? 0) - saidOn;
  const mapHref = street ? `/map?street=${street.id}` : "/map";

  return (
    <>
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-6 pb-5">
          <div>
            <h1 className="text-[1.75rem] leading-none font-bold tracking-[-0.02em]">Kot Delo?</h1>
            <p className="mt-1.5 text-sm text-primary-foreground/85">Where is the water?{areaName && ` · ${areaName}`}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Your street
            <span className="relative">
              <select
                className="h-12 w-full appearance-none rounded-xl bg-card pr-10 pl-3 text-base font-normal text-foreground disabled:text-muted-foreground"
                value={street?.id ?? ""}
                disabled={!base}
                onChange={(e) => pickStreet(Number(e.target.value))}
              >
                <option value="" disabled>{base ? "Choose your street" : "Loading streets…"}</option>
                {base?.streets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-4 pb-6">
        {demo && (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-950">
            Demo mode: sample data. The real CWA timetable is not loaded or the database is not reachable.
          </p>
        )}

        {!base ? (
          <div className={card}>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-4 h-10 w-56" />
            <Skeleton className="mt-5 h-9 w-full" />
          </div>
        ) : !street ? (
          <p className={card}>
            <span className="block font-semibold">Choose your street to start.</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              You will see today&apos;s official water window, what your neighbours report, and you can call the tanker.
            </span>
          </p>
        ) : (
          <>
            <section className={card} aria-labelledby="window-title">
              <h2 id="window-title" className="font-semibold">Today&apos;s official water window</h2>
              <p className="min-h-5 text-sm text-muted-foreground">{areaName}{today && ` · ${today}`}</p>
              {!data ? (
                <>
                  <Skeleton className="mt-4 h-10 w-56" />
                  <Skeleton className="mt-5 h-9 w-full" />
                </>
              ) : data.failed ? (
                <p role="alert" className="mt-3 text-sm text-red-800">
                  The timetable did not load. Check your connection, then choose your street again.
                </p>
              ) : win ? (
                <>
                  <p className="mt-4 text-[2.5rem] leading-none font-bold tracking-[-0.02em] tabular-nums">{win.start_time} – {win.end_time}</p>
                  {status && (
                    <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${status.tone === "now" ? "text-primary" : "text-muted-foreground"}`}>
                      <span aria-hidden className={`size-2 rounded-full ${status.tone === "now" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                      {status.label}
                    </p>
                  )}
                  <DayTrack start={win.start_time} end={win.end_time} reports={data.reports} now={now} />
                  <p className="mt-4 text-sm">
                    {data.reports.length
                      ? `Today on ${street.name}: ${plural(saidOn, "report", "reports")} of water, ${plural(saidOff, "report", "reports")} of no water.`
                      : `No reports from ${street.name} yet today. Yours can be the first.`}
                  </p>
                  {win.source_url ? (
                    <a href={win.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 py-2 text-xs text-primary underline underline-offset-2">
                      Source: CWA communiqué{win.source_date && `, ${fmtDate(win.source_date, { day: "numeric", month: "short", year: "numeric" })}`}
                      <ExternalLink aria-hidden className="size-3" />
                    </a>
                  ) : (
                    <p className="mt-1 py-2 text-xs text-muted-foreground">Source: CWA communiqué</p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm">
                  No water supply is scheduled for {areaName} today. If your tank is empty, call the tanker below.
                </p>
              )}
            </section>

            <section aria-labelledby="report-title" className="flex flex-col gap-3 pt-1">
              <h2 id="report-title" className="font-semibold">Is water running on {street.name} now?</h2>
              <div className="grid grid-cols-2 gap-3">
                {REPORTS.map(({ type, label, Icon, style }) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={reported === type}
                    onClick={() => report(type)}
                    className={`flex h-16 items-center justify-center gap-2 rounded-xl border text-base font-semibold transition-[scale,background-color,border-color,color] duration-150 ease-snap active:scale-[0.97] ${style}`}
                  >
                    {reported === type ? <Check aria-hidden className="size-5" /> : <Icon aria-hidden className="size-5" />}
                    {label}
                  </button>
                ))}
              </div>
              {reported && (
                <p role="status" className={`text-sm text-muted-foreground ${enter}`}>
                  Thanks. &quot;{REPORT_LABEL[reported]}&quot; is reported for {street.name}.
                </p>
              )}
              {sendError === "report" && (
                <p role="alert" className="text-sm text-red-800">Your report was not sent. Check your connection and tap again.</p>
              )}
            </section>

            <section aria-labelledby="tanker-title" className="flex flex-col gap-3 pt-1">
              <div>
                <h2 id="tanker-title" className="font-semibold">Need the tanker?</h2>
                <p className="text-sm text-muted-foreground">One tap puts {street.name} on the driver&apos;s stop list.</p>
              </div>
              {request === "served" && (
                <p role="status" className={`flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900 ${enter}`}>
                  <Check aria-hidden className="size-5 shrink-0" />
                  Served. The tanker has delivered to {street.name}.
                </p>
              )}
              {request === "waiting" ? (
                <Link href={mapHref} role="status" className={`flex min-h-16 items-center gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3 text-primary ${enter}`}>
                  <Truck aria-hidden className="size-6 shrink-0" />
                  <span className="flex-1">
                    <span className="block font-semibold">Tanker requested</span>
                    <span className="block text-sm">Waiting for the driver. See it live on the map</span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0" />
                </Link>
              ) : (
                <Button size="tap" onClick={requestWater}>
                  <Truck aria-hidden />
                  I need water
                </Button>
              )}
              {sendError === "request" && (
                <p role="alert" className="text-sm text-red-800">Your request was not sent. Check your connection and tap again.</p>
              )}
            </section>

            <SurpriseCard />

            <section className={card} aria-labelledby="reliability-title">
              <h2 id="reliability-title" className="font-semibold">Schedule vs reality</h2>
              {!data ? (
                <>
                  <Skeleton className="mt-3 h-8 w-52" />
                  <Skeleton className="mt-4 h-14 w-full" />
                </>
              ) : data.reliability.days === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Not enough history for {street.name} yet. Every &quot;Water is here&quot; tap during the official window counts as a day on time.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.01em]">
                    On time {data.reliability.onTime} of {plural(data.reliability.days, "day", "days")}
                  </p>
                  <p className="text-sm text-muted-foreground">Days when neighbours on {street.name} reported water inside the official window.</p>
                  <ol className="mt-4 flex gap-1.5">
                    {data.reliability.perDay.map((d) => (
                      <li key={d.date} className="flex flex-1 flex-col items-center gap-1.5 text-xs text-muted-foreground">
                        <span aria-hidden className={`flex h-9 w-full items-center justify-center rounded-md text-white ${d.onTime ? "bg-emerald-700" : "bg-red-600"}`}>
                          {d.onTime ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
                        </span>
                        {fmtDate(d.date, { weekday: "short" })}
                        <span className="sr-only">{d.onTime ? "on time" : "late or no water"}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          </>
        )}

        {base && (
          <section className={card} aria-labelledby="heat-title">
            <h2 id="heat-title" className="font-semibold">Hours without water</h2>
            <p className="mb-3 text-sm text-muted-foreground">Since the last &quot;Water is here&quot; report, street by street.</p>
            <HeatMap streets={base.streets} hoursDry={base.hoursDry} myStreetId={streetId} />
            <ul aria-hidden className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {HEAT_LEGEND.map((b) => (
                <li key={b.label} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: b.hex }} />
                  {b.label}
                </li>
              ))}
            </ul>
            <ul className="mt-1 divide-y">
              {base.streets.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: heatHex(base.hoursDry[s.id]) }} />
                  <span className={`flex-1 ${s.id === streetId ? "font-semibold" : ""}`}>
                    {s.name}
                    {s.id === streetId && <span className="font-normal text-muted-foreground"> · your street</span>}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{fmtHours(base.hoursDry[s.id])}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex flex-col items-center gap-1 pt-2 text-center text-xs text-muted-foreground">
          <p>Reports and requests are stored by street, never by house or person.</p>
          <nav className="flex gap-6 text-sm">
            <Link href={mapHref} className="py-3 text-primary underline underline-offset-4">Tanker map</Link>
            <Link href="/driver" className="py-3 text-primary underline underline-offset-4">Driver view</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}

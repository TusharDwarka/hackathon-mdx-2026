"use client";

// Water-day cards for the resident Overview (docs/WATER-DAY-SPLIT.md P2 steps 2-6):
// planner + reminders, tomorrow forecast, water quality, save water + nearby help.
// Rules are P3's (lib/queries.ts ops 24, 26, 27); water-day.ts adds the calendar file and distances. Every card has a labelled fallback. No card ever says water is safe or unsafe to drink.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, CalendarPlus, Car, Info, MapPin, Recycle, ShieldAlert, Truck, Waves, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Source } from "@/components/home/PublicInfo";
import { addDays, icsFile, km, withOffsets, type Win } from "@/components/home/water-day";
import { planDay, type Forecast, type PlanStep, type Quality } from "@/lib/queries";
type WaterPoint = { name: string; kind: string; lat: number; lng: number; source_url: string | null };
import { fmtDate } from "@/components/home/shared";
import { toMin } from "@/components/home/time";

const card = "surface reveal p-5";
const title = "text-lg leading-snug font-bold tracking-[-0.01em]";
const tag = "chip min-h-6 px-2 text-xs";
const enter = "transition-[opacity,translate] duration-200 ease-snap starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0";
const SAMPLE: Win = { start_time: "05:00", end_time: "09:00" };

export function dayLabel(day: string, today: string | null) {
  if (day === today) return "Today";
  if (today && day === addDays(today, 1)) return "Tomorrow";
  return fmtDate(day, { weekday: "long", day: "numeric", month: "short" });
}

const DOT: Record<PlanStep["kind"], string> = {
  remind: "bg-amber-400",
  arrive: "bg-primary",
  task: "bg-card ring-2 ring-primary",
  end: "bg-foreground/60",
};

// ---------- 2 + 3: planner and reminders ----------

/** kind: official = the CWA window; estimate = from the forecast; sample = no window known yet (labelled). */
export function Planner({ place, day, win, kind, now, today }: { place: string | null; day: string | null; win: Win | null; kind: "official" | "estimate" | "sample"; now: Date | null; today: string | null }) {
  const w = win ?? SAMPLE;
  const d = day ?? today;
  const steps = withOffsets(planDay(w), w); // P3 op 27
  const startAt = d ? new Date(`${d}T00:00`).getTime() + toMin(w.start_time) * 60_000 : null;
  const at = (offset: number) => (startAt === null ? null : startAt + offset * 60_000);
  const current = now ? steps.findLastIndex((s) => (at(s.offset) ?? Infinity) <= now.getTime()) : -1;
  const remindAt = at(-30);
  const sample = kind === "sample" || !d;

  const [status, setStatus] = useState<string | null>(null);
  const [fired, setFired] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const notify = (body: string) => {
    setFired(body); // always shown in the page: works even where notifications are blocked or unsupported
    try { navigator.vibrate?.(300); } catch { /* not supported */ }
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Kot Delo?", { body, icon: "/favicon.ico" }); } catch { /* Android Chrome needs a service worker: the page alert covers it */ }
    }
  };
  const ask = async () => {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "default") await Notification.requestPermission();
    return Notification.permission;
  };
  const how = (p: string) => (p === "granted" ? "a notification" : p === "denied" ? "an alert on this page (notifications are blocked in this browser)" : "an alert on this page");

  // Primary, demo-safe: a calendar event with its own alarm. Works with the browser closed.
  const addToCalendar = () => {
    if (!d) return;
    const url = URL.createObjectURL(new Blob([icsFile(d, w, place ?? "your area", new Date())], { type: "text/calendar;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `kot-delo-water-${d}.ics` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus(`Calendar event saved for ${dayLabel(d, today).toLowerCase()} ${w.start_time}. Open it and add it: your phone rings 30 minutes before, even with Kot Delo? closed.`);
  };
  // Extra: only while this tab stays open (no push server, no service worker).
  const remindInTab = async () => {
    const p = await ask();
    const ms = remindAt === null ? -1 : remindAt - Date.now();
    if (ms <= 0) return setStatus("The 30-minute reminder time for this window has passed. Use Add to calendar for the next one.");
    timers.current.push(window.setTimeout(() => notify(`Water in 30 minutes in ${place ?? "your area"}. Start the pump.`), ms));
    setStatus(`Set: ${how(p)} at ${steps[0].time}. Keep this tab open, or use Add to calendar.`);
  };
  const test = async () => {
    const p = await ask();
    setStatus(`Test: ${how(p)} in 5 seconds…`);
    timers.current.push(window.setTimeout(() => notify(`Water in 30 minutes in ${place ?? "your area"}. Start the pump. (test)`), 5000));
  };

  return (
    <section data-tour="day" className={`${card} lg:p-6`} aria-labelledby="planner-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="planner-title" className={title}>Your water day</h2>
        {sample ? (
          <span className={`${tag} bg-amber-100 text-amber-950`}>Sample day</span>
        ) : kind === "estimate" ? (
          <span className={`${tag} bg-muted`}>Estimate</span>
        ) : (
          <span className={`${tag} bg-primary/10 text-primary`}>Official CWA</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {sample
          ? "Choose your locality to plan around your real window. This is an example."
          : `${dayLabel(d!, today)} in ${place} · ${w.start_time} – ${w.end_time}${kind === "estimate" ? " (forecast, not an official time)" : ""}`}
      </p>

      {fired && (
        <p role="alert" className={`mt-3 flex items-center gap-3 rounded-2xl bg-amber-100 px-4 py-3 font-semibold text-amber-950 ${enter}`}>
          <BellRing aria-hidden className="size-5 shrink-0" />
          <span className="flex-1">{fired}</span>
          <button type="button" onClick={() => setFired(null)} aria-label="Dismiss" className="grid size-9 place-items-center rounded-full hover:bg-amber-200"><X aria-hidden className="size-4" /></button>
        </p>
      )}

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_0.9fr]">
        <ol className="relative flex flex-col">
          {steps.map((s, i) => {
            const isNow = i === current && current < steps.length - 1;
            const past = i < current || (current === steps.length - 1);
            return (
              <li key={i} className={`relative flex gap-3 rounded-2xl py-2 pr-2 pl-1 ${isNow ? "bg-primary/10" : ""}`}>
                {i < steps.length - 1 && <span aria-hidden className="absolute top-7 bottom-[-0.75rem] left-[4.8rem] w-0.5 bg-primary/15" />}
                <span className={`w-14 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums ${past ? "text-muted-foreground" : ""}`}>{s.time}</span>
                <span aria-hidden className={`relative z-10 mt-1.5 size-3 shrink-0 rounded-full ${DOT[s.kind]} ${past ? "opacity-50" : ""}`} />
                <span className={`min-w-0 flex-1 text-sm ${past ? "text-muted-foreground" : "font-medium"} ${s.kind === "arrive" || s.kind === "end" ? "font-semibold" : ""}`}>
                  {s.label}
                  {isNow && <span className={`${tag} ml-2 min-h-5 bg-primary text-primary-foreground`}>Now</span>}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Bell aria-hidden className="size-5 text-primary" />
            Remind me 30 min before
          </p>
          <Button data-tour="calendar" size="tap" disabled={sample} onClick={addToCalendar} className="h-12 text-sm">
            <CalendarPlus aria-hidden className="size-5" />
            Add to calendar
          </Button>
          <Button size="tap" variant="outline" disabled={sample} onClick={remindInTab} className="h-12 border-transparent bg-card text-sm">
            <Bell aria-hidden className="size-5" />
            Also alert me in this tab
          </Button>
          <button type="button" onClick={test} className="min-h-11 text-sm font-semibold text-primary underline underline-offset-2">Test reminder now (5 s)</button>
          {status && <p role="status" className={`text-xs text-muted-foreground ${enter}`}>{status}</p>}
          <p className="text-xs text-muted-foreground">The calendar alarm works with the browser closed. A planned time, not a promise that water reaches every house.</p>
        </div>
      </div>
    </section>
  );
}

// ---------- 4: tomorrow forecast ----------

const BASIS: Record<Forecast["basis"], string> = { official: "Official timetable", every_second_day: "Every-second-day pattern", history: "Neighbours' past reports" };
const CONF = { high: 3, medium: 2, low: 1 } as const;

export function ForecastCard({ forecast, loading, today }: { forecast: Forecast | null; loading: boolean; today: string | null }) {
  const official = forecast?.basis === "official";
  return (
    <section className={card} aria-labelledby="forecast-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="forecast-title" className={title}>Next water</h2>
        {forecast && <span className={`${tag} ${official ? "bg-primary/10 text-primary" : "bg-muted"}`}>{official ? "Official CWA" : "Estimate"}</span>}
      </div>
      {loading ? (
        <div className="mt-3 h-10 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      ) : !forecast ? (
        <p className="mt-2 text-sm text-muted-foreground">Not enough information for a forecast yet: no official window and too few neighbours&apos; reports. Choose your locality and street.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{dayLabel(forecast.next.day, today)}</p>
          <p className="text-[2.25rem] leading-none font-bold tracking-[-0.02em] tabular-nums">{forecast.next.start_time} – {forecast.next.end_time}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`${tag} bg-muted`}>{BASIS[forecast.basis]}</span>
            <span className={`${tag} bg-muted`} aria-label={`Confidence: ${forecast.confidence}`}>
              <span aria-hidden className="flex gap-0.5">
                {[1, 2, 3].map((n) => <span key={n} className={`h-2.5 w-1.5 rounded-full ${n <= CONF[forecast.confidence] ? "bg-primary" : "bg-primary/20"}`} />)}
              </span>
              <span className="first-letter:uppercase">{forecast.confidence}</span> confidence
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{forecast.note}.</p>
          {official ? (
            <Source url={forecast.source_url}>CWA communiqué</Source>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">An estimate, not an official time and not a promise. An official CWA window always wins.</p>
          )}
        </>
      )}
    </section>
  );
}

// ---------- 5: water quality ----------

export function QualityCard({ quality }: { quality: Quality }) {
  const notice = quality.level === "official_notice" && quality.notice;
  return (
    <section className={`${card} ${notice ? "bg-amber-50 ring-2 ring-amber-300" : ""}`} aria-labelledby="quality-title" role={notice ? "alert" : undefined}>
      <h2 id="quality-title" className={`flex items-center gap-2 ${title}`}>
        {notice ? <ShieldAlert aria-hidden className="size-5 text-amber-700" /> : <Info aria-hidden className="size-5 text-primary" />}
        Water quality
      </h2>
      {notice && (
        <p className="mt-2 font-semibold first-letter:uppercase">
          {notice.title} <span className="font-normal text-muted-foreground">· {fmtDate(notice.day, { day: "numeric", month: "short", year: "numeric" })}</span>
        </p>
      )}
      <p className="mt-1.5 text-sm text-muted-foreground">{quality.message}</p>
      {notice && <Source url={notice.source_url}>Official notice</Source>}
      <Link href="/resident?tab=report" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2">
        Water looks dirty? Report it
      </Link>
    </section>
  );
}

// ---------- 6: save water + nearby help ----------

const TIPS = [
  { Icon: Car, title: "Skip the car wash", text: "A hose wash can use 150 L or more. Wait until the cuts end." },
  { Icon: Waves, title: "Bucket, not hose", text: "Use a bucket and cup for washing and the yard." },
  { Icon: Recycle, title: "Reuse rinse water", text: "Rinse water from dishes or laundry can water plants or flush the toilet." },
];

export function SaveWaterCard({ points, from }: { points: WaterPoint[]; from: { lat: number; lng: number; name: string } | null }) {
  const near = from ? points.map((p) => ({ ...p, d: km(from, p) })).sort((a, b) => a.d - b.d).slice(0, 2) : [];
  return (
    <section className={`${card} grid gap-5 md:grid-cols-2 md:gap-8`} aria-labelledby="save-title">
      <div>
        <h2 id="save-title" className={title}>Save water</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {TIPS.map(({ Icon, title: t, text }) => (
            <li key={t} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon aria-hidden className="size-5" /></span>
              <span className="text-sm">
                <span className="block font-semibold">{t}</span>
                <span className="text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold">Nearby help</h3>
        {!from ? (
          <p className="mt-2 text-sm text-muted-foreground">Choose your street to see the nearest tanker stop or water point.</p>
        ) : near.length ? (
          <ul className="mt-2 flex flex-col gap-2">
            {near.map((p) => (
              <li key={p.name} className="flex items-center gap-3 rounded-2xl bg-muted/70 px-3 py-2.5 text-sm">
                <MapPin aria-hidden className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="text-muted-foreground first-letter:uppercase">{p.kind} · {p.d < 1 ? `${Math.round(p.d * 1000)} m` : `${p.d.toFixed(1)} km`} from {from.name} (straight line)</span>
                </span>
                {p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">Source</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No verified public water points in our sources yet. The tanker map shows where the tanker stops on its round.</p>
        )}
        <Link href="/map" className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[scale] duration-150 ease-snap active:scale-[0.98]">
          <Truck aria-hidden className="size-5" />
          Tanker stops on the live map
        </Link>
      </div>
    </section>
  );
}

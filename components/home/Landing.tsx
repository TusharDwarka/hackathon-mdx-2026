"use client";

// Landing: introduces Kot Delo? in short sections (hero with a phone preview, how it works, four features,
// latest CWA notices, call to action). Real figures where we have them: today's official window (op 1),
// the reservoir readings and the CWA notices (P5's CSVs, dated and sourced). The map and report
// pictures are illustrations and say so to screen readers.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, Droplet, DropletOff, Gift, MapPin, Megaphone, ShieldCheck, Truck, UserRoundX } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { BottomWaves, Logo } from "@/components/ui/brand";
import { Gauge } from "@/components/ui/gauge";
import { DayTrack } from "@/components/home/DayTrack";
import { minOfDay, windowStatus } from "@/components/home/time";
import { Skeleton, fmtDate, loadArea, useBase, useNow, type AreaData } from "@/components/home/shared";
import { Source } from "@/components/home/PublicInfo";
import type { PublicData } from "@/components/home/public-data";

const TRUST = [
  { label: "Free forever", Icon: Gift },
  { label: "No account, no ads", Icon: UserRoundX },
  { label: "Official CWA timetables", Icon: BadgeCheck },
  { label: "By street, never by person", Icon: ShieldCheck },
];
const STEPS = [
  { title: "Pick your locality", text: "See today's official CWA water window and the week ahead. No account needed.", Icon: CalendarClock },
  { title: "Tap what you see", text: "\"Water is here\" or \"No water\": your report counts together with your neighbours'.", Icon: Megaphone },
  { title: "Follow the tanker", text: "No water for too long? Request the tanker for your street and watch it come on the map.", Icon: Truck },
];
const long = { day: "numeric", month: "short", year: "numeric" } as const;
const h2 = "text-3xl leading-tight font-bold tracking-[-0.03em] sm:text-4xl lg:text-5xl";
const cta = cn(buttonVariants({ size: "tap" }), "h-14 px-7");

export function Landing({ info }: { info: PublicData }) {
  const now = useNow();
  const { base } = useBase();
  const [loadedWin, setLoadedWin] = useState<{ base: object; area: AreaData } | null>(null);
  const mav = info.reservoirs[0]; // Mare aux Vacoas, the reservoir behind the demo area

  // The timetable is per area and the demo has one area: any street gives the area's window.
  useEffect(() => {
    if (!base) return;
    let current = true;
    const s = base.streets[0];
    loadArea(s.area_id, s.id, base.demo).then((area) => {
      if (current) setLoadedWin({ base, area });
    });
    return () => {
      current = false;
    };
  }, [base]);

  const area = base && loadedWin?.base === base ? loadedWin.area : undefined;
  const win = area === undefined ? undefined : area.failed ? "failed" : area.win;
  const areaName = base ? (base.areaNames[base.streets[0].area_id] ?? "") : "";
  const status = win && win !== "failed" && now ? windowStatus(win.start_time, win.end_time, minOfDay(now)) : null;
  const hour = now?.getHours() ?? 9;
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const windowText =
    win === undefined ? <Skeleton className="h-9 w-40" /> : win === "failed" ? <span className="text-base">Timetable did not load</span> : win ? `${win.start_time} – ${win.end_time}` : <span className="text-base">No supply today</span>;

  return (
    <div className="overflow-x-clip">
      {/* Top bar */}
      <header className="sticky top-0 z-50 px-3 pt-3 sm:px-4 lg:px-6">
        <div className="glass mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-full pr-2 pl-3 shadow-card sm:pl-4">
          <Link href="/" aria-label="Kot Delo? home"><Logo /></Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#notices" className="hover:text-foreground">CWA notices</a>
          </nav>
          <Link href="/login" className={cn(buttonVariants(), "h-12 px-5 text-sm font-semibold")}>Open the app</Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-10 pb-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:px-6 lg:pt-16 lg:pb-24">
          <div>
            <p className="chip bg-white/75 text-primary shadow-card">
              <MapPin aria-hidden className="size-4" />
              Made for Mauritius · CWA water rationing
            </p>
            <h1 className="mt-6 text-[2.6rem] leading-[1] font-bold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              A small app
              <br />
              that tells you
              <br />
              when <span className="text-primary">water</span> comes.
            </h1>
            <p className="mt-6 max-w-[44ch] text-lg text-muted-foreground">
              Official CWA timetables, what your neighbours see right now, and the tanker truck live on a map. All in one place, in English, on any phone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={cta}>
                Open the app <ArrowRight aria-hidden />
              </Link>
              <Link href="/resident" className={cn(buttonVariants({ size: "tap", variant: "outline" }), "h-14 border-transparent bg-white/80 px-7 shadow-card")}>
                Just browse
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2">
              {TRUST.map(({ label, Icon }) => (
                <li key={label} className="chip min-h-8 bg-white/60 px-3 text-xs text-foreground">
                  <Icon aria-hidden className="size-4 text-primary" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Phone preview: today's real window and reservoir level, in the app's look. */}
          <div className="relative mx-auto w-full max-w-[22rem] pt-4 pb-8">
            <div aria-hidden className="wave-panel absolute inset-x-2 top-10 bottom-0 rotate-[4deg] rounded-[3rem] opacity-90" />
            <div aria-hidden className="absolute -top-2 -right-4 size-28 rounded-full bg-white/50 blur-2xl" />
            <Phone>
              <p className="text-xs text-muted-foreground">{hello}</p>
              <p className="text-lg leading-tight font-bold tracking-[-0.02em]">{areaName || "Your locality"}</p>
              <div className="surface mt-3 rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.6875rem] font-semibold text-muted-foreground">Today&apos;s official window</p>
                  <span className="chip min-h-5 bg-primary/10 px-1.5 text-[0.625rem] text-primary">CWA</span>
                </div>
                <p className="mt-1.5 text-[1.6rem] leading-none font-bold tracking-[-0.02em] tabular-nums">{windowText}</p>
                {status && <p className={`mt-1.5 text-[0.6875rem] font-medium ${status.tone === "now" ? "text-primary" : "text-muted-foreground"}`}>{status.label}</p>}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <div className="surface rounded-2xl p-2.5">
                  <p className="text-[0.625rem] font-semibold text-muted-foreground">Mare aux Vacoas</p>
                  {mav.pct === null ? (
                    <p className="mt-2 text-xs text-muted-foreground">No reading</p>
                  ) : (
                    <Gauge value={mav.pct} label={`Mare aux Vacoas ${Math.round(mav.pct)}% full`} className="mt-1 max-w-28">
                      <span className="text-sm font-bold tabular-nums">{Math.round(mav.pct)}%</span>
                    </Gauge>
                  )}
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-900">
                    <Droplet aria-hidden className="size-4" />
                    <p className="mt-1 text-[0.6875rem] leading-tight font-semibold">Water is running</p>
                    <p className="text-[0.5625rem]">3 of 4 agree</p>
                  </div>
                  <div className="rounded-2xl bg-primary p-2.5 text-primary-foreground">
                    <Truck aria-hidden className="size-4" />
                    <p className="mt-1 text-[0.6875rem] leading-tight font-semibold">Tanker 2 stops away</p>
                  </div>
                </div>
              </div>
            </Phone>
            <Mascot className="absolute -bottom-2 -left-3 w-24 sm:-left-10 sm:w-28" />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-16 lg:px-6 lg:pb-24">
          <h2 className={h2}>How does it work?</h2>
          <p className="mt-3 max-w-[52ch] text-lg text-muted-foreground">During rationing, the timetable says one thing and the tap says another. Kot Delo? puts both side by side.</p>
          <ol className="mt-8 grid gap-4 md:grid-cols-3 lg:gap-6">
            {STEPS.map(({ title, text, Icon }, i) => (
              <li key={title} className="surface relative overflow-hidden p-6">
                <span aria-hidden className="absolute -top-4 -right-1 text-8xl font-bold text-primary/8 tabular-nums">{i + 1}</span>
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-bold tracking-[-0.01em]">{title}</h3>
                <p className="mt-1.5 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" aria-label="Features" className="mx-auto flex max-w-6xl scroll-mt-24 flex-col gap-16 px-4 pb-16 lg:gap-24 lg:px-6 lg:pb-24">
          <Feature
            kicker="Schedule"
            title="Know your water window"
            text="The official CWA supply time for your locality, today and for the next 7 days, with the communiqué it comes from. Then see if it matched reality on your street."
          >
            <div className="surface w-full max-w-md p-6">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Today in {areaName || "your locality"}</p>
                <span className={`chip min-h-6 px-2 text-xs ${base?.demo ? "bg-amber-100 text-amber-950" : "bg-primary/10 text-primary"}`}>{base?.demo ? "Sample data" : "Official CWA"}</span>
              </div>
              <p className="mt-4 text-[2.5rem] leading-none font-bold tracking-[-0.02em] tabular-nums">{windowText}</p>
              {status && <p className={`mt-2 text-sm font-medium ${status.tone === "now" ? "text-primary" : "text-muted-foreground"}`}>{status.label}</p>}
              {win && win !== "failed" && <DayTrack start={win.start_time} end={win.end_time} reports={[]} now={now} />}
              {win && win !== "failed" && (
                <Source url={win.source_url && win.source_url !== "#" ? win.source_url : null}>
                  CWA communiqué{win.source_date && `, ${fmtDate(win.source_date, long)}`}
                </Source>
              )}
            </div>
          </Feature>

          <Feature
            flip
            kicker="Tanker"
            title="Follow the tanker live"
            text="Request water for your street in two taps. The driver's position moves on the map in real time, and you see how many stops are left before yours."
          >
            <MapPicture />
          </Feature>

          <Feature
            kicker="Neighbours"
            title="Tell your street in one tap"
            text="“Water is here” or “No water”. One report is a signal, not a fact: Kot Delo? only says “confirmed” when neighbours agree."
          >
            <div aria-hidden className="surface flex w-full max-w-md flex-col gap-4 p-6">
              <p className="font-semibold">Is water running at your place now?</p>
              <div className="grid grid-cols-2 gap-3">
                <span className="flex h-14 items-center justify-center gap-2 rounded-full bg-emerald-700 font-semibold text-white"><Droplet className="size-5" /> Water is here</span>
                <span className="flex h-14 items-center justify-center gap-2 rounded-full border border-red-700/25 bg-red-50 font-semibold text-red-900"><DropletOff className="size-5" /> No water</span>
              </div>
              <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
                <span className="chip min-h-7 bg-primary/10 px-2.5 text-xs text-primary"><BadgeCheck className="size-4" /> Confirmed</span>
                3 of 4 reports agree
              </p>
            </div>
          </Feature>

          <Feature
            flip
            kicker="Reservoirs"
            title="Every reservoir at a glance"
            text="The latest published fill level of the island's reservoirs, each with its date and source. Old readings are marked as stale, never passed off as today's."
          >
            <ul className="surface flex w-full max-w-md flex-col gap-4 p-6">
              {info.reservoirs.filter((r) => r.pct !== null).slice(0, 5).map((r) => (
                <li key={r.name}>
                  <p className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold">{r.name}</span>
                    <span className="font-bold tabular-nums">{r.pct!.toFixed(1)}%</span>
                  </p>
                  <span aria-hidden className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-primary" style={{ width: `${Math.min(100, r.pct!)}%` }} />
                  </span>
                  {r.date && <p className="mt-1 text-xs text-muted-foreground">{r.basis === "measured" ? "Measured" : "Published"} {fmtDate(r.date, long)}</p>}
                </li>
              ))}
              <li>
                <Link href="/resident?tab=reservoirs" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
                  All reservoirs <ArrowRight aria-hidden className="size-4" />
                </Link>
              </li>
            </ul>
          </Feature>
        </section>

        {/* Latest CWA notices: visible on the first screen a visitor reads, not hidden in a menu. */}
        {info.news.length > 0 && (
          <section id="notices" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-16 lg:px-6 lg:pb-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className={h2}>Latest CWA notices</h2>
                <p className="mt-3 max-w-[52ch] text-lg text-muted-foreground">Dated notices from public sources. Open the source to check whether one still applies.</p>
              </div>
              <Link href="/resident?tab=news" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary">
                All notices <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <ul className="mt-8 grid gap-4 md:grid-cols-3 lg:gap-6">
              {info.news.slice(0, 3).map((n) => (
                <li key={`${n.date}-${n.title}`} className="surface flex flex-col p-6">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="chip min-h-6 bg-primary/10 px-2 text-xs text-primary first-letter:uppercase">{n.kind}</span>
                    {fmtDate(n.date, long)}
                  </p>
                  <p className="mt-3 font-semibold first-letter:uppercase">{n.title}</p>
                  {n.areas && <p className="mt-1 text-sm text-muted-foreground">Areas: {n.areas}</p>}
                  <div className="mt-auto pt-2">
                    <Source url={n.source_url} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Call to action */}
        <section className="px-4 pb-10 lg:px-6">
          <div className="wave-panel relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 pt-10 pb-28 text-center sm:px-10 lg:pt-14 lg:pb-36">
            <h2 className={h2}>Ready when the water is.</h2>
            <p className="mx-auto mt-3 max-w-[44ch] text-lg text-white/85">Open Kot Delo? as a resident in one tap. Tanker drivers and CWA staff sign in with their access code.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/login" className={cn(buttonVariants({ size: "tap" }), "h-14 bg-white px-7 text-primary hover:bg-white/90")}>
                Open the app <ArrowRight aria-hidden />
              </Link>
              <Link href="/login?role=driver" className={cn(buttonVariants({ size: "tap" }), "h-14 bg-white/15 px-7 hover:bg-white/25")}>
                Staff sign-in
              </Link>
            </div>
            <BottomWaves className="h-24 text-white/40 lg:h-32" />
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between lg:px-6">
        <Logo className="text-base text-foreground" />
        <p className="max-w-[60ch]">
          Built in 24 hours at the MDX Hackathon 2026, Mauritius. Data: CWA communiqués and public reservoir bulletins. Reports are stored by street, never by house or person.
        </p>
      </footer>
    </div>
  );
}

function Feature({ kicker, title, text, flip, children }: { kicker: string; title: string; text: string; flip?: boolean; children: React.ReactNode }) {
  return (
    <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : ""}>
        <p className="text-sm font-semibold tracking-[0.08em] text-primary uppercase">{kicker}</p>
        <h3 className="mt-2 text-3xl leading-tight font-bold tracking-[-0.03em] lg:text-4xl">{title}</h3>
        <p className="mt-3 max-w-[46ch] text-lg text-muted-foreground">{text}</p>
      </div>
      <div className="relative flex justify-center">
        <div aria-hidden className="absolute inset-6 rounded-[2.5rem] bg-white/45 blur-2xl" />
        <div className="relative flex w-full justify-center">{children}</div>
      </div>
    </article>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[16.5rem] rounded-[2.75rem] bg-[oklch(0.22_0.04_260)] p-2.5 shadow-[0_30px_60px_-20px_oklch(0.3_0.1_260/0.55)]">
      <span aria-hidden className="absolute top-4 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
      <div className="min-h-[30rem] overflow-hidden rounded-[2.25rem] bg-background px-3.5 pt-11 pb-5">{children}</div>
    </div>
  );
}

/** The Kot Delo? drop. Decoration only. */
function Mascot({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 150" className={className}>
      <defs>
        <linearGradient id="drop" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.12 232)" />
          <stop offset="1" stopColor="oklch(0.52 0.19 258)" />
        </linearGradient>
      </defs>
      <path d="M60 6C60 6 12 64 12 98a48 48 0 0 0 96 0C108 64 60 6 60 6Z" fill="url(#drop)" stroke="white" strokeWidth="4" />
      <ellipse cx="38" cy="82" rx="7" ry="13" fill="white" fillOpacity="0.45" transform="rotate(20 38 82)" />
      <circle cx="46" cy="102" r="5.5" fill="oklch(0.22 0.04 260)" />
      <circle cx="76" cy="102" r="5.5" fill="oklch(0.22 0.04 260)" />
      <circle cx="47.5" cy="100.5" r="1.8" fill="white" />
      <circle cx="77.5" cy="100.5" r="1.8" fill="white" />
      <path d="M50 116q11 9 22 0" fill="none" stroke="oklch(0.22 0.04 260)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="36" cy="113" r="5" fill="oklch(0.8 0.1 15)" fillOpacity="0.55" />
      <circle cx="86" cy="113" r="5" fill="oklch(0.8 0.1 15)" fillOpacity="0.55" />
    </svg>
  );
}

/** Illustration of the live map: streets, the round's stops, the truck and the "stops away" card. */
function MapPicture() {
  return (
    <div className="surface relative w-full max-w-md overflow-hidden p-0">
      <svg role="img" aria-label="Illustration: a tanker on a street map, two stops away from your street" viewBox="0 0 400 300" className="block h-auto w-full bg-[oklch(0.96_0.02_200)]">
        <g stroke="white" strokeWidth="14" strokeLinecap="round" fill="none">
          <path d="M-10 70H410M-10 190H410M90 -10V310M250 -10V310M330 120L410 40" />
        </g>
        <g fill="oklch(0.9 0.06 150)">
          <rect x="110" y="88" width="120" height="84" rx="10" />
          <rect x="270" y="210" width="120" height="80" rx="10" />
        </g>
        <path d="M40 190H250V70H360" fill="none" stroke="oklch(0.54 0.19 258)" strokeWidth="5" strokeDasharray="2 10" strokeLinecap="round" />
        {[{ x: 90, y: 190, done: true }, { x: 250, y: 190, done: false }, { x: 250, y: 70, done: false }, { x: 360, y: 70, mine: true }].map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.mine ? 12 : 8} fill={p.mine ? "oklch(0.54 0.19 258)" : p.done ? "oklch(0.6 0.13 155)" : "white"} stroke="oklch(0.54 0.19 258)" strokeWidth="4" />
        ))}
        <g transform="translate(152 168)">
          <rect width="50" height="34" rx="10" fill="oklch(0.22 0.04 260)" />
          <path d="M13 11h16v12H13zM29 15h6l4 4v4H29z" fill="white" />
        </g>
      </svg>
      <div className="glass absolute right-3 bottom-3 left-3 flex items-center gap-3 rounded-2xl p-3 shadow-card">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Truck aria-hidden className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-bold">2 stops away</span>
          <span className="block text-sm text-muted-foreground">Tanker on the way · about 12 min</span>
        </span>
      </div>
    </div>
  );
}

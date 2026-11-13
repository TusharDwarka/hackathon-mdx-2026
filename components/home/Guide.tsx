"use client";

// How to use Kot Delo?: the same steps feed the first-visit tour on /resident (a modal you can skip and
// reopen with "How it works") and the full /guide page (resident, tanker driver, CWA staff).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bell, CalendarClock, CircleHelp, ClipboardList, Droplets, KeyRound, LayoutDashboard, LineChart, MapPin, Megaphone,
  MessageSquareWarning, Newspaper, Play, Route, Square, Truck, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, type Role } from "@/components/ui/brand";
import { tilt } from "@/components/ui/motion";

type Step = { title: string; text: string; Icon: LucideIcon; href?: string; cta?: string };

export const GUIDE: Record<Role, { label: string; Icon: LucideIcon; intro: string; steps: Step[] }> = {
  resident: {
    label: "Resident",
    Icon: Droplets,
    intro: "Know when water comes, plan around it and get the tanker when it does not. No account needed.",
    steps: [
      { title: "Pick your locality", text: "Choose where you live. Today's official CWA water window shows at once. No account, no name.", Icon: MapPin, href: "/resident", cta: "Open Overview" },
      { title: "Plan your water day", text: "The top card turns the window into a plan: start the pump, fill the tank first, washing machine, finish before the water stops.", Icon: CalendarClock, href: "/resident", cta: "See your day" },
      { title: "Never miss the water", text: "Tap Add to calendar. Your phone rings 30 minutes before the window, even with Kot Delo? closed.", Icon: Bell, href: "/resident", cta: "Set a reminder" },
      { title: "Tell your street", text: "In Report, tap Water is here or No water. One report is a signal; when neighbours agree, the status says Confirmed.", Icon: Megaphone, href: "/resident?tab=report", cta: "Open Report" },
      { title: "Call the tanker", text: "No water for too long? Choose how many litres and request the tanker for your street. It is free.", Icon: Truck, href: "/resident?tab=report", cta: "Request water" },
      { title: "Follow it live", text: "Watch the truck move on the map and see how many stops are left before yours.", Icon: Route, href: "/map", cta: "Open the map" },
      { title: "Stay informed", text: "Reservoir levels, CWA notices and the next-water forecast, always with a date and a source. A forecast is an estimate, never a promise.", Icon: Newspaper, href: "/resident?tab=news", cta: "Read notices" },
    ],
  },
  driver: {
    label: "Tanker driver",
    Icon: Truck,
    intro: "One round at a time. Your position is shared only while a round is on.",
    steps: [
      { title: "Sign in", text: "On Sign in, choose Tanker driver, pick your tanker and enter the access code from your supervisor.", Icon: KeyRound, href: "/login?role=driver", cta: "Driver sign-in" },
      { title: "Start a round", text: "The round lists streets with waiting requests that no other driver has, with the litres to deliver.", Icon: Play, href: "/driver", cta: "Open My round" },
      { title: "Drive", text: "Allow location when asked. Residents see the truck move. No GPS? Use Simulate the drive for a demo.", Icon: Route },
      { title: "Mark each stop Served", text: "Tap Served at each street. The resident's request flips to Served on their phone straight away.", Icon: ClipboardList },
      { title: "End the round", text: "Tap End round when the tank is empty or every stop is served. Location sharing stops.", Icon: Square },
    ],
  },
  ops: {
    label: "CWA staff",
    Icon: LayoutDashboard,
    intro: "A rule-based view of reports, requests and complaints, stored by street only.",
    steps: [
      { title: "Sign in", text: "On Sign in, choose CWA staff and enter the operations access code.", Icon: KeyRound, href: "/login?role=ops", cta: "Staff sign-in" },
      { title: "Read the priorities", text: "Overview ranks streets by hours without water and waiting requests, with the reason for each.", Icon: LayoutDashboard, href: "/ops", cta: "Open Operations" },
      { title: "Dispatch tankers", text: "Dispatch fills each tanker up to its capacity from waiting demand and sends the round to a driver.", Icon: Truck, href: "/ops", cta: "Dispatch" },
      { title: "Handle complaints", text: "Complaints arrive live, grouped by area. Resolve them when they are dealt with.", Icon: MessageSquareWarning, href: "/ops", cta: "Complaints" },
      { title: "Watch the reservoirs", text: "Tanks and the trend line show when a reservoir may reach 30% and 20%. An estimate, labelled as one.", Icon: LineChart, href: "/ops", cta: "See the trend" },
    ],
  },
};

const SEEN_KEY = "kotdelo.onboarded";
const seen = () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } };
const enter = "transition-[opacity,translate] duration-300 ease-snap starting:translate-x-3 starting:opacity-0 motion-reduce:starting:translate-x-0";

/** "How it works" button + the step-by-step tour. `auto` opens it on the first visit to this phone. */
export function OnboardingTour({ role = "resident", auto = false }: { role?: Role; auto?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0);
  const { steps } = GUIDE[role];
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => {
    if (auto && !seen()) ref.current?.showModal();
  }, [auto]);
  const open = () => { setI(0); ref.current?.showModal(); };
  const close = () => { markSeen(); ref.current?.close(); };

  return (
    <>
      <button type="button" onClick={open} className="chip shrink-0 bg-card shadow-card">
        <CircleHelp aria-hidden className="size-4 text-primary" /> How it works
      </button>
      <dialog
        ref={ref}
        aria-labelledby="tour-title"
        onClose={markSeen}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] overflow-visible bg-transparent p-0 text-foreground backdrop:bg-[oklch(0.25_0.06_255/0.35)] backdrop:backdrop-blur-sm open:transition-[opacity,scale] open:duration-300 open:ease-snap open:starting:scale-95 open:starting:opacity-0"
      >
        <div className="glass overflow-hidden rounded-[2rem] shadow-nav">
          <div className="wave-panel relative flex h-40 items-center justify-center overflow-hidden">
            <span aria-hidden className="absolute size-40 rounded-full border-2 border-white/30 animate-[ripple_2.8s_ease-out_infinite]" />
            <span aria-hidden className="absolute size-40 rounded-full border-2 border-white/30 animate-[ripple_2.8s_ease-out_1.4s_infinite]" />
            <span key={i} className={`relative grid size-20 place-items-center rounded-3xl bg-white/20 shadow-card ${enter}`}>
              <step.Icon aria-hidden className="size-10" />
            </span>
            <button type="button" onClick={close} aria-label="Close the guide" className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              <X aria-hidden className="size-5" />
            </button>
            <p className="absolute top-4 left-5 text-xs font-semibold tracking-[0.08em] text-white/80 uppercase">Step {i + 1} of {steps.length}</p>
          </div>
          <div key={`t${i}`} className={`px-6 pt-5 ${enter}`}>
            <h2 id="tour-title" className="text-xl font-bold tracking-[-0.01em]">{step.title}</h2>
            <p className="mt-2 min-h-[4.5rem] text-muted-foreground">{step.text}</p>
          </div>
          <div className="flex items-center justify-center gap-1.5 pt-3" aria-hidden>
            {steps.map((_, n) => (
              <span key={n} className={`h-2 rounded-full transition-[width,background-color] duration-300 ease-snap ${n === i ? "w-6 bg-primary" : "w-2 bg-primary/25"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2 p-5">
            {i > 0 ? (
              <Button size="tap" variant="outline" onClick={() => setI(i - 1)} className="h-12 border-transparent bg-card px-4" aria-label="Back">
                <ArrowLeft aria-hidden />
              </Button>
            ) : (
              <Button size="tap" variant="ghost" onClick={close} className="h-12 px-4 text-sm">Skip</Button>
            )}
            <Button size="tap" onClick={() => (last ? close() : setI(i + 1))} className="h-12 flex-1 text-sm">
              {last ? "Start using Kot Delo?" : "Next"} {!last && <ArrowRight aria-hidden />}
            </Button>
          </div>
          <p className="px-6 pb-5 text-center text-xs text-muted-foreground">
            Full guide for residents, drivers and CWA staff:{" "}
            <Link href="/guide" onClick={close} className="font-semibold text-primary underline underline-offset-2">How to use Kot Delo?</Link>
          </p>
        </div>
      </dialog>
    </>
  );
}

/** The /guide page: every role's steps as a numbered path, each with a link to the screen it talks about. */
export function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-10 md:max-w-3xl lg:max-w-5xl lg:px-8 lg:pt-8">
      <PageHeader eyebrow="Guide" title="How to use Kot Delo?">
        <OnboardingTour />
      </PageHeader>
      <nav aria-label="Guide sections" className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(GUIDE) as Role[]).map((r) => {
          const { label, Icon } = GUIDE[r];
          return (
            <a key={r} href={`#${r}`} className="chip min-h-11 bg-card shadow-card hover:bg-primary hover:text-primary-foreground">
              <Icon aria-hidden className="size-4" /> {label}
            </a>
          );
        })}
      </nav>
      {(Object.keys(GUIDE) as Role[]).map((r) => {
        const { label, Icon, intro, steps } = GUIDE[r];
        return (
          <section key={r} id={r} aria-labelledby={`${r}-title`} className="mt-10 scroll-mt-6">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-card"><Icon aria-hidden className="size-6" /></span>
              <div>
                <h2 id={`${r}-title`} className="text-2xl font-bold tracking-[-0.02em]">{label}</h2>
                <p className="text-sm text-muted-foreground">{intro}</p>
              </div>
            </div>
            <ol className="relative mt-6 flex flex-col gap-4 before:absolute before:top-6 before:bottom-6 before:left-6 before:w-0.5 before:bg-primary/20">
              {steps.map((s, n) => (
                <li key={s.title} className="reveal relative flex gap-4">
                  <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full bg-card text-lg font-bold text-primary shadow-card tabular-nums">{n + 1}</span>
                  <div className="tilt surface flex min-w-0 flex-1 flex-col gap-1 p-5 sm:flex-row sm:items-center sm:gap-4" {...tilt}>
                    <span className="hidden size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid"><s.Icon aria-hidden className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.title}</span>
                      <span className="block text-sm text-muted-foreground">{s.text}</span>
                    </span>
                    {s.href && (
                      <Link href={s.href} className="mt-2 inline-flex min-h-11 shrink-0 items-center gap-1 self-start text-sm font-semibold text-primary sm:mt-0 sm:self-center">
                        {s.cta} <ArrowRight aria-hidden className="size-4" />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      <p className="surface mt-10 px-5 py-4 text-center text-xs text-muted-foreground">
        Kot Delo? stores reports and requests by street, never by house or person. Official CWA times win over any estimate. It never says whether water is safe to drink: follow official CWA and Ministry of Health advice.
      </p>
    </main>
  );
}

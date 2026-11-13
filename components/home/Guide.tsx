"use client";

// How to use Kot Delo?: the same steps feed the first-visit tour on /resident (a modal you can skip and
// reopen with "How it works") and the full /guide page (resident, tanker driver, CWA staff).
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft, ArrowRight, Bell, CalendarClock, CircleHelp, ClipboardList, Droplets, KeyRound, LayoutDashboard, LineChart, MapPin, Megaphone,
  MessageSquareWarning, Newspaper, Play, Route, Square, Truck, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark, PageHeader, type Role } from "@/components/ui/brand";
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
      { title: "Never miss the water", text: "Tap Remind me 30 min before. Your phone rings before the window, even with Kot Delo? closed.", Icon: Bell, href: "/resident", cta: "Set a reminder" },
      { title: "Tell your street", text: "In Report, tap Water is here or No water. When neighbours agree, the status says Confirmed.", Icon: Megaphone, href: "/resident?tab=report", cta: "Open Report" },
      { title: "Request a tanker", text: "No water for too long? In Tanker, tap I need a tanker. Free, for your street.", Icon: Truck, href: "/resident?tab=request", cta: "Request a tanker" },
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
      { title: "Start a round", text: "The round lists the streets with waiting households that no other driver has.", Icon: Play, href: "/driver", cta: "Open My round" },
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

// ---------- Spotlight tour: dims the screen, lights up the real button and says what to tap ----------
// Each step points at an element with data-tour="<target>" (no target = a centred welcome card).
// The card sits on the half of the screen away from the lit element, so it works the same at 390px and 1440px.
type TourStep = { target?: string; title: string; text: string; Icon: LucideIcon };
const TOURS: Record<"resident" | "landing", TourStep[]> = {
  landing: [
    { title: "Welcome to Kot Delo?", text: "Know when water comes, tell your street, follow the tanker. Here is what to tap.", Icon: Droplets },
    { target: "preview", title: "Today's real window", text: "Today's official CWA water time for the demo area.", Icon: CalendarClock },
    { target: "browse", title: "Try it now", text: "Opens the resident app. No account needed.", Icon: MapPin },
    { target: "open", title: "Drivers and CWA staff", text: "Choose your role here. Drivers and CWA staff sign in with a code.", Icon: KeyRound },
  ],
  resident: [
    { title: "Welcome to Kot Delo?", text: "30 seconds on what to tap. Skip any time.", Icon: Droplets },
    { target: "place", title: "Start here", text: "Search where you live. Today's CWA water window shows at once.", Icon: MapPin },
    { target: "day", title: "Your water day", text: "The window as a plan: pump, tank, then washing machine.", Icon: CalendarClock },
    { target: "calendar", title: "Never miss the water", text: "Your phone rings 30 min before the water, even with the app closed.", Icon: Bell },
    { target: "nav-report", title: "Tell your street", text: "Water is here, or no water? One tap in Report.", Icon: Megaphone },
    { target: "nav-request", title: "Request a tanker", text: "No water for too long? One tap, free. Then follow the truck live.", Icon: Truck },
    { target: "nav-drink", title: "Is my tap water safe?", text: "Official advisories for your area, and what to do if the water is cloudy, white or from a tank.", Icon: Newspaper },
    { target: "help", title: "That's it", text: "Tap the drop to see this tour again.", Icon: CircleHelp },
  ],
};
const TOUR_KEY = { resident: "kotdelo.onboarded", landing: "kotdelo.tour.landing" };
const seen = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return true; } };
const noSubscribe = () => () => {};
const markSeen = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* private mode */ } };
const findTarget = (t?: string) =>
  t ? [...document.querySelectorAll<HTMLElement>(`[data-tour="${t}"]`)].find((el) => el.getClientRects().length > 0) : undefined;
const enter = "transition-[opacity,translate] duration-300 ease-snap starting:translate-y-2 starting:opacity-0 motion-reduce:starting:translate-y-0";
type Box = { x: number; y: number; w: number; h: number };
const PAD = 8;

/** The spotlight tour and its button: a "How it works" chip, or `drop` = the droplet logo, which pulses
 *  with a "Tap the drop" bubble until this phone has opened or dismissed the tour once. */
export function OnboardingTour({ tour = "resident", drop = false, label = "How it works", className = "chip shrink-0 bg-card shadow-card" }: {
  tour?: keyof typeof TOURS; drop?: boolean; label?: string; className?: string;
}) {
  const stored = useSyncExternalStore(noSubscribe, () => seen(TOUR_KEY[tour]), () => true); // server: no hint
  const [hidden, setHidden] = useState(false);
  const hint = drop && !stored && !hidden;
  const dismiss = () => { markSeen(TOUR_KEY[tour]); setHidden(true); };
  const ref = useRef<HTMLDialogElement>(null);
  const at = useRef(0); // current step, read by the frame loop
  const scrolledTo = useRef(-1); // the step whose element was last scrolled into view
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({ w: 390, h: 800 });
  const steps = TOURS[tour];
  const step = steps[i];
  const last = i === steps.length - 1;

  const go = (n: number) => { at.current = n; setI(n); };
  const open = useCallback(() => {
    const dlg = ref.current;
    if (!dlg || dlg.open) return;
    at.current = 0;
    scrolledTo.current = -1;
    dlg.showModal();
    // While open: follow the lit element every frame (smooth scroll, data loading in, rotation).
    // Only re-renders when its box actually moves; stops by itself when the dialog closes.
    const follow = () => {
      if (!dlg.open) return;
      const el = findTarget(steps[at.current].target);
      if (el && scrolledTo.current !== at.current) {
        scrolledTo.current = at.current;
        const tall = el.offsetHeight > window.innerHeight * 0.7; // too tall to centre: show its top
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      const r = el?.getBoundingClientRect();
      setBox((b) => (!r ? null : b && b.x === r.x && b.y === r.y && b.w === r.width && b.h === r.height ? b : { x: r.x, y: r.y, w: r.width, h: r.height }));
      setView((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      requestAnimationFrame(follow);
    };
    follow();
  }, [steps]);
  const close = () => ref.current?.close(); // onClose marks it seen (also Esc)
  const start = () => { dismiss(); go(0); open(); };

  // Card goes on the half of the screen away from the lit element; centred when nothing is lit.
  const place = !box ? "top-1/2 -translate-y-1/2" : box.y + box.h / 2 > view.h / 2 ? "top-[max(1rem,env(safe-area-inset-top))]" : "bottom-[max(1rem,env(safe-area-inset-bottom))]";
  const spot = box
    ? { transform: `translate(${box.x - PAD}px, ${box.y - PAD}px)`, width: box.w + PAD * 2, height: box.h + PAD * 2, borderRadius: box.h < 80 ? 999 : 28 }
    : { transform: `translate(${view.w / 2}px, ${view.h / 2}px)`, width: 0, height: 0, borderRadius: 999 };

  return (
    <>
      {drop ? (
        <span className="relative shrink-0">
          <button type="button" data-tour="help" onClick={start} aria-label="Quick guide" className="relative grid size-11 place-items-center rounded-2xl transition-[scale] duration-150 ease-snap active:scale-[0.95]">
            {hint && <span aria-hidden className="absolute inset-0 rounded-2xl border-2 border-primary/50 animate-[ripple_2s_ease-out_infinite]" />}
            <LogoMark className="size-11 rounded-2xl" />
          </button>
          {hint && (
            <span role="status" className={`absolute top-full left-0 z-40 mt-3 flex items-center gap-1 rounded-2xl bg-primary py-1 pr-1 pl-3.5 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-nav ${enter}`}>
              <span aria-hidden className="absolute -top-1.5 left-4 size-3 rotate-45 rounded-[2px] bg-primary" />
              Tap the drop for a quick guide
              <button type="button" onClick={dismiss} aria-label="Hide the tip" className="relative grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/15">
                <X aria-hidden className="size-4" />
              </button>
            </span>
          )}
        </span>
      ) : (
        <button type="button" data-tour="help" onClick={start} className={className}>
          <CircleHelp aria-hidden className="size-4 text-primary" /> {label}
        </button>
      )}
      <dialog
        ref={ref}
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        onClose={() => markSeen(TOUR_KEY[tour])}
        className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-foreground backdrop:bg-transparent open:transition-opacity open:duration-300 open:ease-snap open:starting:opacity-0"
      >
        {/* The spotlight: a hole in a dim layer (its huge shadow), with a pulsing white ring. */}
        <div
          aria-hidden
          style={spot}
          className="pointer-events-none fixed top-0 left-0 shadow-[0_0_0_200vmax_oklch(0.2_0.06_255/0.62)] outline-2 outline-offset-2 outline-white transition-[transform,width,height,border-radius] duration-300 ease-snap animate-[spot-pulse_1.8s_ease-in-out_infinite]"
        />
        <div key={i} className={`glass fixed inset-x-3 mx-auto flex max-w-sm flex-col gap-3 rounded-[1.75rem] p-5 shadow-nav ${place} ${enter}`}>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary bg-[image:linear-gradient(180deg,oklch(1_0_0/0.3),transparent_60%)] text-primary-foreground shadow-card">
              <step.Icon aria-hidden className="size-5" />
            </span>
            <p className="flex-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Step {i + 1} of {steps.length}</p>
            {!last && (
              <button type="button" onClick={close} className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-white/50 hover:text-foreground">
                Skip
              </button>
            )}
          </div>
          <div>
            <h2 id="tour-title" className="text-lg leading-snug font-bold tracking-[-0.01em]">{step.title}</h2>
            <p id="tour-text" className="mt-1 text-[0.9375rem] text-muted-foreground">{step.text}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {steps.map((_, n) => (
                <span key={n} className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-snap ${n === i ? "w-5 bg-primary" : "w-1.5 bg-primary/25"}`} />
              ))}
            </div>
            {i > 0 && (
              <Button size="tap" variant="outline" onClick={() => go(i - 1)} className="size-12 border-transparent bg-white/60 p-0" aria-label="Back">
                <ArrowLeft aria-hidden />
              </Button>
            )}
            <Button size="tap" autoFocus onClick={() => (last ? close() : go(i + 1))} className="h-12 px-5 text-sm">
              {last ? "Got it" : i === 0 ? "Show me" : "Next"} {!last && <ArrowRight aria-hidden />}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** The /guide page: every role's steps as a numbered path, each with a link to the screen it talks about. */
export function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-10 md:max-w-3xl lg:max-w-5xl lg:px-8 lg:pt-8">
      <PageHeader eyebrow="Guide" title="How to use Kot Delo?" logo={<OnboardingTour drop />} />
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
        Stored by street, never by house or person. Official CWA times win over any estimate.
      </p>
    </main>
  );
}

"use client";

// Landing: what Kot Delo? is, the area status (reservoir level + supply tier, op 12;
// today's official window, op 1) and three ways in: Resident, Driver, CWA operations.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Droplets, ExternalLink, LayoutDashboard, MapPin, Truck } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { minOfDay, windowStatus } from "@/components/home/time";
import { DemoBanner, Skeleton, fmtDate, getReservoirStatus, useBase, useNow } from "@/components/home/shared";
import type { ReservoirStatus, Tier } from "@/components/home/rules";
import { getTodayWindow, type Window } from "@/lib/queries";
import { MOCK_WINDOW } from "@/lib/mock";

const title = "text-lg leading-snug font-bold tracking-[-0.01em]";

const TIER: Record<Tier, { label: string; style: string }> = {
  normal: { label: "Normal", style: "bg-emerald-50 text-emerald-900" },
  watch: { label: "Watch", style: "bg-amber-100 text-amber-950" },
  critical: { label: "Critical", style: "bg-red-50 text-red-900" },
};

const ENTRIES = [
  { href: "/resident", label: "Resident", text: "Water on your street, reports, free tanker request", Icon: Droplets },
  { href: "/driver", label: "Tanker driver", text: "Start a round and share your position", Icon: Truck },
  { href: "/ops", label: "CWA operations", text: "Priorities, complaints and reservoir status", Icon: LayoutDashboard },
];

export default function Landing() {
  const now = useNow();
  const { base, retry } = useBase();
  const [reservoir, setReservoir] = useState<(ReservoirStatus & { sample: boolean }) | null>(null);
  const [loadedWin, setLoadedWin] = useState<{ base: object; win: Window | null | "failed" } | null>(null);

  useEffect(() => {
    let current = true;
    getReservoirStatus().then((r) => {
      if (current) setReservoir(r);
    });
    return () => {
      current = false;
    };
  }, []);

  // The timetable is per area and the demo has one area: any street gives the area's window.
  useEffect(() => {
    if (!base) return;
    let current = true;
    (base.demo ? Promise.resolve<Window | null>(MOCK_WINDOW) : getTodayWindow(base.streets[0].id))
      .catch((e): "failed" => {
        console.warn("window not loaded:", e);
        return "failed";
      })
      .then((w) => {
        if (current) setLoadedWin({ base, win: w });
      });
    return () => {
      current = false;
    };
  }, [base]);

  // undefined = loading (also while "Try again" reloads), null = no window today
  const win = base && loadedWin?.base === base ? loadedWin.win : undefined;
  const areaName = base ? (base.areaNames[base.streets[0].area_id] ?? "") : "";
  const today = now?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const status = win && win !== "failed" && now ? windowStatus(win.start_time, win.end_time, minOfDay(now)) : null;

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-6 lg:max-w-6xl lg:px-6 lg:pt-8">
      {base?.demo && (
        <div className="mb-4 lg:mb-6">
          <DemoBanner onRetry={retry} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <section className="surface relative overflow-hidden p-6 pb-28 lg:p-10 lg:pb-40">
            <div className="flex items-center justify-between gap-3">
              <p className="chip bg-primary/10 text-primary">
                <MapPin aria-hidden className="size-4" />
                {areaName || "Mauritius"}
              </p>
              <Link href="/map" aria-label="Open the live tanker map" className="icon-btn bg-primary text-primary-foreground">
                <Truck aria-hidden className="size-5" />
              </Link>
            </div>
            <h1 className="mt-6 text-[2.75rem] leading-none font-bold tracking-[-0.03em] lg:text-6xl">Kot Delo?</h1>
            <p className="mt-2 text-lg font-semibold text-primary lg:text-xl">Where is the water?</p>
            <p className="mt-3 max-w-[38ch] text-base text-muted-foreground lg:text-lg">
              During CWA water rationing, see when water really reaches your street, tell your neighbours, and follow the tanker truck live.
            </p>
            {/* Decoration only: three wave shapes, no photo. */}
            <svg aria-hidden viewBox="0 0 400 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-20 w-full lg:h-28">
              <path d="M0 40C60 15 120 15 200 38S340 62 400 34V80H0Z" className="fill-primary/15" />
              <path d="M0 52C70 30 140 70 220 50S350 30 400 52V80H0Z" className="fill-primary/35" />
              <path d="M0 64C80 50 160 78 240 62S360 52 400 66V80H0Z" className="fill-primary" />
            </svg>
          </section>

          <section className="surface p-3" aria-labelledby="enter-title">
            <h2 id="enter-title" className={`${title} px-2 pt-2`}>Open Kot Delo? as</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {ENTRIES.map(({ href, label, text, Icon }, i) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex min-h-[4.5rem] items-center gap-4 rounded-2xl px-4 py-3 transition-[scale,background-color] duration-150 ease-snap active:scale-[0.98] ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-primary/10"}`}
                  >
                    <span className={`grid size-12 shrink-0 place-items-center rounded-full ${i === 0 ? "bg-white/20" : "bg-card text-primary"}`}>
                      <Icon aria-hidden className="size-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{label}</span>
                      <span className={`block text-sm ${i === 0 ? "text-primary-foreground/90" : "text-muted-foreground"}`}>{text}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="px-2 pt-4 pb-2 text-xs text-muted-foreground">No login. Reports and requests are stored by street, never by house or person.</p>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <section className="surface p-5" aria-labelledby="reservoir-title">
            <div className="flex items-center gap-5">
              {reservoir ? (
                <ProgressRing value={reservoir.level_pct} label={`Mare aux Vacoas reservoir is ${Math.round(reservoir.level_pct)}% full`} className="text-primary">
                  <span className="text-center">
                    <span className="block text-3xl leading-none font-bold tracking-[-0.02em] tabular-nums">{Math.round(reservoir.level_pct)}%</span>
                    <span className="text-xs text-muted-foreground">full</span>
                  </span>
                </ProgressRing>
              ) : (
                <Skeleton className="size-[136px] shrink-0 rounded-full" />
              )}
              <div className="min-w-0">
                <h2 id="reservoir-title" className={title}>Mare aux Vacoas reservoir</h2>
                {reservoir ? (
                  <>
                    <p className={`chip mt-2 ${TIER[reservoir.tier].style}`}>Supply tier: {TIER[reservoir.tier].label}</p>
                    <p className="mt-2 text-sm text-muted-foreground">Level on {fmtDate(reservoir.day, { day: "numeric", month: "long", year: "numeric" })}</p>
                  </>
                ) : (
                  <Skeleton className="mt-2 h-9 w-40" />
                )}
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Tiers use demo thresholds, not official CWA levels: normal from 60%, watch from 30%, critical below 30%.
              {reservoir?.sample && " The level shown is a sample figure until the reservoir data is loaded."}
            </p>
          </section>

          <section className="surface p-5" aria-labelledby="window-title">
            <h2 id="window-title" className={title}>Today&apos;s official water window</h2>
            <p className="min-h-5 text-sm text-muted-foreground">{areaName}{today && ` · ${today}`}</p>
            {win === undefined ? (
              <Skeleton className="mt-4 h-10 w-56" />
            ) : win === "failed" ? (
              <p role="alert" className="mt-3 text-sm text-red-800">The timetable did not load. Check your connection and reload the page.</p>
            ) : win ? (
              <>
                <p className="mt-4 text-[2.5rem] leading-none font-bold tracking-[-0.02em] tabular-nums">{win.start_time} – {win.end_time}</p>
                {status && (
                  <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${status.tone === "now" ? "text-primary" : "text-muted-foreground"}`}>
                    <span aria-hidden className={`size-2 rounded-full ${status.tone === "now" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                    {status.label}
                  </p>
                )}
                {win.source_url ? (
                  <a href={win.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-12 items-center gap-1 text-xs text-primary underline underline-offset-2">
                    Source: CWA communiqué{win.source_date && `, ${fmtDate(win.source_date, { day: "numeric", month: "short", year: "numeric" })}`}
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                ) : (
                  <p className="mt-1 py-2 text-xs text-muted-foreground">Source: CWA communiqué</p>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm">No water supply is scheduled for {areaName} today.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

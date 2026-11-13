"use client";

// Landing: what Kot Delo? is, the Mare aux Vacoas level (real, dated, sourced: P5's CSVs) with
// its supply tier (op 12), today's official window (op 1), the resident way in and a separate staff entry.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Droplets, LayoutDashboard, MapPin, Truck } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { minOfDay, windowStatus } from "@/components/home/time";
import { DemoBanner, Skeleton, fmtDate, loadArea, useBase, useNow, type AreaData } from "@/components/home/shared";
import { MoreLink, ReadingDate, Source } from "@/components/home/PublicInfo";
import type { PublicData } from "@/components/home/public-data";
import { reservoirTier, type ReservoirTier } from "@/lib/queries";

const title = "text-lg leading-snug font-bold tracking-[-0.01em]";

const TIER: Record<ReservoirTier, { label: string; style: string }> = {
  normal: { label: "Normal", style: "bg-emerald-50 text-emerald-900" },
  watch: { label: "Watch", style: "bg-amber-100 text-amber-950" },
  critical: { label: "Critical", style: "bg-red-50 text-red-900" },
};

// Staff screens. ponytail: open in the demo; real staff sign-in comes with P3's session API.
const STAFF = [
  { href: "/driver", label: "Tanker driver", text: "Start a round and share your position", Icon: Truck },
  { href: "/ops", label: "CWA operations", text: "Priorities, complaints and reservoir status", Icon: LayoutDashboard },
];

export function Landing({ info }: { info: PublicData }) {
  const now = useNow();
  const { base, retry } = useBase();
  const [loadedWin, setLoadedWin] = useState<{ base: object; area: AreaData } | null>(null);
  const reservoir = info.reservoirs[0]; // Mare aux Vacoas, the reservoir behind the demo area

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

  // undefined = loading (also while "Try again" reloads), null = no window today
  const area = base && loadedWin?.base === base ? loadedWin.area : undefined;
  const win = area === undefined ? undefined : area.failed ? "failed" : area.win;
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
            <h2 id="enter-title" className={`${title} px-2 pt-2`}>Check your water</h2>
            <Link
              href="/resident"
              className="mt-3 flex min-h-[4.5rem] items-center gap-4 rounded-2xl bg-primary px-4 py-3 text-primary-foreground transition-[scale] duration-150 ease-snap active:scale-[0.98]"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/20">
                <Droplets aria-hidden className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Resident</span>
                <span className="block text-sm text-primary-foreground/90">Schedule, reservoirs and news. Report or call the tanker as a guest.</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0" />
            </Link>
            <p className="px-2 pt-3 pb-1 text-xs text-muted-foreground">No account needed. Reports and requests are stored by street, never by house or person.</p>

            <div id="staff" className="mt-3 scroll-mt-24 border-t px-2 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">For staff</h2>
                <span className="chip min-h-6 bg-amber-100 px-2 text-xs text-amber-950">Demo: open access</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">In this demo anyone can open these screens. A real launch would ask drivers and CWA staff to sign in.</p>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {STAFF.map(({ href, label, text, Icon }) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-[4.5rem] items-center gap-4 rounded-2xl bg-muted px-4 py-3 transition-[scale,background-color] duration-150 ease-snap hover:bg-primary/10 active:scale-[0.98]">
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card text-primary">
                      <Icon aria-hidden className="size-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{label}</span>
                      <span className="block text-sm text-muted-foreground">{text}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <section className="surface p-5" aria-labelledby="reservoir-title">
            {reservoir.pct === null ? (
              <>
                <h2 id="reservoir-title" className={title}>{reservoir.name} reservoir</h2>
                <p className="mt-2 text-sm text-muted-foreground">No verified reading yet.</p>
              </>
            ) : (
              <div className="flex items-center gap-5">
                <ProgressRing value={reservoir.pct} label={`${reservoir.name} reservoir is ${Math.round(reservoir.pct)}% full`} className="text-primary">
                  <span className="text-center">
                    <span className="block text-3xl leading-none font-bold tracking-[-0.02em] tabular-nums">{Math.round(reservoir.pct)}%</span>
                    <span className="text-xs text-muted-foreground">full</span>
                  </span>
                </ProgressRing>
                <div className="min-w-0">
                  <h2 id="reservoir-title" className={title}>{reservoir.name} reservoir</h2>
                  <p className={`chip mt-2 ${TIER[reservoirTier(reservoir.pct)].style}`}>Supply tier: {TIER[reservoirTier(reservoir.pct)].label}</p>
                  <ReadingDate r={reservoir} now={now} />
                  <Source url={reservoir.source_url} />
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Tiers use demo thresholds, not official CWA levels: normal from 60%, watch from 30%, critical below 30%.
            </p>
            <MoreLink href="/resident?tab=reservoirs">All seven reservoirs</MoreLink>
            <MoreLink href="/resident?tab=news">News and CWA notices</MoreLink>
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
                <Source url={win.source_url && win.source_url !== "#" ? win.source_url : null}>
                  CWA communiqué{win.source_date && `, ${fmtDate(win.source_date, { day: "numeric", month: "short", year: "numeric" })}`}
                </Source>
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

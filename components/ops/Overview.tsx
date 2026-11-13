"use client";

// /ops Overview: four counts that jump to the other sections, a tank per reservoir worst first (op 12),
// the reservoir trend chart (op 25), next window per area (op 24) and the heat map (op 11).
import { useEffect, useState } from "react";
import { HEAT_LEGEND, HeatMap } from "@/components/home/HeatMap";
import { fmtL } from "@/components/ops/dispatch";
import type { OpsData } from "@/components/ops/data";
import { loadTanks, type Tanks } from "@/components/ops/forecast";
import { Forecasts } from "@/components/ops/Forecasts";
import { Tank } from "@/components/ops/Tank";
import { TrendChart } from "@/components/ops/TrendChart";
import type { Tier } from "@/components/ops/rules";

export type Section = "overview" | "dispatch" | "complaints" | "review" | "notices";

const TIER: Record<Tier, { label: string; style: string }> = {
  normal: { label: "Normal", style: "bg-emerald-100 text-emerald-900" },
  watch: { label: "Watch", style: "bg-amber-100 text-amber-900" },
  critical: { label: "Critical", style: "bg-red-100 text-red-900" },
};

export function Overview({ data, go, now }: { data: OpsData; go: (s: Section) => void; now: number }) {
  const [tanks, setTanks] = useState<Tanks | null>(null);
  useEffect(() => { loadTanks().then(setTanks); }, []);
  const waitingL = data.waiting.reduce((s, r) => s + r.litres, 0);
  const waitingStreets = new Set(data.waiting.map((r) => r.street_id)).size;
  const open = data.complaints.filter((c) => c.status === "open").length;
  const review = data.statuses.filter((s) => s.status === "suspect" || s.status === "unconfirmed").length;
  const tiles: { label: string; value: string; detail: string; to: Section }[] = [
    { label: "Waiting for a tanker", value: fmtL(waitingL), detail: `${data.waiting.length} requests on ${waitingStreets} street${waitingStreets === 1 ? "" : "s"}`, to: "dispatch" },
    { label: "Tankers out", value: String(data.rounds.length), detail: data.rounds.length ? data.rounds.map((r) => r.label).join(", ") : "none on the road", to: "dispatch" },
    { label: "Open complaints", value: String(open), detail: "grouped by category and street", to: "complaints" },
    { label: "Reports to review", value: String(review), detail: "unconfirmed or contradicted, last 3 h", to: "review" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ul className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <button type="button" onClick={() => go(t.to)} className="surface flex h-full w-full flex-col items-start gap-1 p-4 text-left transition-transform duration-150 ease-snap active:scale-[0.98] motion-reduce:transition-none">
              <span className="text-sm text-muted-foreground">{t.label}</span>
              <span className="text-3xl font-bold tabular-nums">{t.value}</span>
              <span className="text-xs text-muted-foreground">{t.detail}</span>
            </button>
          </li>
        ))}
      </ul>

      <Reservoirs tanks={tanks} />
      <TrendChart reservoirs={tanks?.reservoirs.map((r) => r.reservoir) ?? []} now={now} />
      <Forecasts data={data} now={now} />

      <section className="surface flex flex-col gap-3 p-4 lg:col-span-3">
        <h2 className="font-semibold">Hours since water was last reported, per street</h2>
        <HeatMap streets={data.streets} hoursDry={data.hoursDry} myStreetId={null} />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {HEAT_LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-full" style={{ background: l.hex }} /> {l.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** One tank per reservoir, lowest first; missing readings stay visible at the end. */
function Reservoirs({ tanks }: { tanks: Tanks | null }) {
  const list = tanks ? [...tanks.reservoirs].sort((a, b) => (a.state === "missing" ? 1e3 : a.level_pct) - (b.state === "missing" ? 1e3 : b.level_pct)) : null;
  return (
    <section className="surface flex flex-col gap-3 p-4 lg:col-span-3">
      <h2 className="font-semibold">Reservoirs, lowest first</h2>
      {!list ? <div className="h-36 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /> : (
        <ul className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
          {list.map((r) => (
            <li key={r.reservoir} className="flex flex-col items-center gap-1 text-center">
              {r.state === "missing" ? (
                <>
                  <Tank level={null} tier={null} label={`${r.reservoir}: no reading`} className="h-20 w-16" />
                  <span className="text-xs font-medium">{r.reservoir}</span>
                  <span className="text-xs text-muted-foreground">no reading</span>
                </>
              ) : (
                <>
                  <Tank level={r.level_pct} tier={r.tier} label={`${r.reservoir} ${r.level_pct}% on ${fmtDay(r.day)}, ${TIER[r.tier].label}`} className="h-20 w-16" />
                  <span className="text-xs font-medium leading-tight">{r.reservoir}</span>
                  <span className="text-lg font-bold tabular-nums leading-none">{r.level_pct}%</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TIER[r.tier].style}`}>{TIER[r.tier].label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {r.source_url ? <a className="underline" href={r.source_url} target="_blank" rel="noreferrer">{fmtDay(r.day)}</a> : fmtDay(r.day)}
                    {r.state === "stale" && " · old reading"}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Dashed marks at 30% and 20%. Tiers are demo thresholds: 60%+ normal, 30 to 60% watch, under 30% critical. &quot;Old reading&quot; = more than 14 days old.
        {tanks && !tanks.fromApi && " Latest published figures from our data files (live table not loaded)."} A storage level never says whether tap water is safe to drink.
      </p>
    </section>
  );
}

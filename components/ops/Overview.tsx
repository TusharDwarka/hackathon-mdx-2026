"use client";

// /ops Overview: reservoir (op 12), heat map (op 11) and four counts that jump to the other sections.
import { HEAT_LEGEND, HeatMap } from "@/components/home/HeatMap";
import { fmtL } from "@/components/ops/dispatch";
import { SAMPLE_RESERVOIR, type OpsData } from "@/components/ops/data";
import type { Tier } from "@/components/ops/rules";

export type Section = "overview" | "dispatch" | "complaints" | "review";

const TIER: Record<Tier, { label: string; style: string }> = {
  normal: { label: "Normal", style: "bg-emerald-100 text-emerald-900" },
  watch: { label: "Watch", style: "bg-amber-100 text-amber-900" },
  critical: { label: "Critical", style: "bg-red-100 text-red-900" },
};

export function Overview({ data, go }: { data: OpsData; go: (s: Section) => void }) {
  const reservoir = data.reservoir ?? SAMPLE_RESERVOIR;
  const reservoirIsSample = data.demo || !data.reservoir;
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

      <section className="surface flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Reservoir status</h2>
        <div className="flex items-end gap-3">
          <span className="text-5xl font-bold tabular-nums">{reservoir.level_pct}%</span>
          <span className={`mb-2 rounded-full px-3 py-1 text-sm font-semibold ${TIER[reservoir.tier].style}`}>{TIER[reservoir.tier].label}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${reservoir.level_pct}% full`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, reservoir.level_pct)}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">
          {reservoir.reservoir} · measured {reservoir.day}
          {reservoir.source_url && <> · <a className="text-primary underline" href={reservoir.source_url} target="_blank" rel="noreferrer">source</a></>}
        </p>
        <p className="text-xs text-muted-foreground">
          Tiers are demo thresholds: 60%+ normal, 30 to 60% watch, under 30% critical. A storage level says nothing about whether tap water is safe to drink.
          {reservoirIsSample && " Sample figure until daily levels are loaded."}
        </p>
      </section>

      <section className="surface flex flex-col gap-3 p-4 lg:col-span-2">
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

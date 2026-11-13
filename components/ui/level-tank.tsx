// Reservoir tank diagram (docs/WATER-DAY-SPLIT.md P2 step 1). Inline SVG, no chart library.
// Water fill = pct, a wave on top, colour by supply tier, dashed marks at 30% and 20%, caption "34.6% on 16 Oct".
// P4 imports this on /ops: the props below are published, do not change them (add optional ones only).
//   <LevelTank name="Mare aux Vacoas" pct={34.6} day="2026-10-16" />
import { cn } from "cn";

const TIER = {
  normal: { water: "oklch(0.62 0.16 245)", text: "text-primary", label: "Normal" },
  watch: { water: "oklch(0.77 0.15 75)", text: "text-amber-800", label: "Watch" },
  critical: { water: "oklch(0.64 0.2 27)", text: "text-red-800", label: "Critical" },
} as const;
// Same demo thresholds as reservoirTier() in lib/queries.ts.
const tierOf = (pct: number) => (pct >= 60 ? "normal" : pct >= 30 ? "watch" : "critical");
const TOP = 12, H = 128; // inner tank: y from 12 to 140

export function LevelTank({ name, pct, day, className }: { name: string; pct: number | null; day?: string | null; className?: string }) {
  const p = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const tier = pct === null ? null : TIER[tierOf(p)];
  const y = TOP + H * (1 - p / 100);
  const mark = (v: number) => TOP + H * (1 - v / 100);
  const when = day ? new Date(`${day}T00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  const caption = pct === null ? "No verified reading" : `${p.toFixed(1)}%${when ? ` on ${when}` : ""}`;
  const id = `tank-${name.replace(/\W+/g, "")}`;
  return (
    <figure className={cn("flex flex-col items-center gap-1.5", className)}>
      <svg role="img" aria-label={`${name}: ${caption}${tier ? `, ${tier.label.toLowerCase()} level` : ""}`} viewBox="0 0 120 152" className="h-auto w-full max-w-28">
        <defs>
          <clipPath id={id}>
            <rect x="14" y={TOP} width="92" height={H} rx="14" />
          </clipPath>
        </defs>
        <rect x="14" y={TOP} width="92" height={H} rx="14" className="fill-primary/6" />
        {tier && (
          <g clipPath={`url(#${id})`}>
            <rect x="0" y={y + 4} width="120" height={H + 20} fill={tier.water} />
            <path d={`M0 ${y + 5} Q 15 ${y - 2} 30 ${y + 5} T 60 ${y + 5} T 90 ${y + 5} T 120 ${y + 5} V ${y + 12} H 0 Z`} fill={tier.water} />
            <path d={`M0 ${y + 9} Q 15 ${y + 3} 30 ${y + 9} T 60 ${y + 9} T 90 ${y + 9} T 120 ${y + 9}`} fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="2" />
          </g>
        )}
        {[30, 20].map((v) => (
          <g key={v}>
            <line x1="14" x2="106" y1={mark(v)} y2={mark(v)} strokeDasharray="4 4" strokeWidth="1.5" className="stroke-foreground/45" />
            <text x="118" y={mark(v) + 3.5} textAnchor="end" className="fill-muted-foreground text-[9px] font-semibold">{v}</text>
          </g>
        ))}
        <rect x="14" y={TOP} width="92" height={H} rx="14" fill="none" strokeWidth="3" className="stroke-foreground/20" />
        <rect x="40" y="4" width="40" height="10" rx="4" className="fill-foreground/20" />
      </svg>
      <figcaption className="text-center leading-tight">
        <span className="block text-sm font-semibold">{name}</span>
        <span className={cn("block text-xs font-medium tabular-nums", tier ? tier.text : "text-muted-foreground")}>{caption}</span>
      </figcaption>
    </figure>
  );
}

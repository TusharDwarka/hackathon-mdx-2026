// LOCAL STAND-IN for P2's components/ui/level-tank.tsx (docs/WATER-DAY-SPLIT.md P2 item 1, not on main yet).
// Inline SVG tank: water fill = level, wave line, tier colour, dashed marks at 30% and 20%.
// Swap this import for P2's component once it is published; nothing else depends on it.
import { useId } from "react";
import type { Tier } from "@/components/ops/rules";

const FILL: Record<Tier, string> = { normal: "fill-emerald-500", watch: "fill-amber-500", critical: "fill-red-500" };

export function Tank({ level, tier, label, className }: { level: number | null; tier: Tier | null; label: string; className?: string }) {
  const clip = useId();
  const top = 6, h = 68; // inner tank, viewBox units
  const pct = level == null ? 0 : Math.min(100, Math.max(0, level));
  const y = top + h * (1 - pct / 100);
  const mark = (p: number) => top + h * (1 - p / 100);
  return (
    <svg viewBox="0 0 60 80" role="img" aria-label={label} className={className}>
      <defs>
        <clipPath id={clip}><rect x="5" y={top} width="50" height={h} rx="9" /></clipPath>
      </defs>
      <rect x="5" y={top} width="50" height={h} rx="9" className="fill-muted" />
      {level != null && (
        <g clipPath={`url(#${clip})`}>
          <path
            d={`M0 ${y} q7.5 -3 15 0 t15 0 t15 0 t15 0 V80 H0 Z`}
            className={`${tier ? FILL[tier] : "fill-primary"} opacity-90`}
          />
          <path d={`M0 ${y} q7.5 -3 15 0 t15 0 t15 0 t15 0`} fill="none" strokeWidth="1.2" className="stroke-white/70" />
        </g>
      )}
      {[30, 20].map((p) => (
        <line key={p} x1="5" x2="55" y1={mark(p)} y2={mark(p)} strokeWidth="0.8" strokeDasharray="2.5 2" className={p === 20 ? "stroke-red-700" : "stroke-foreground/50"} />
      ))}
      <rect x="5" y={top} width="50" height={h} rx="9" fill="none" strokeWidth="1.5" className="stroke-foreground/25" />
    </svg>
  );
}

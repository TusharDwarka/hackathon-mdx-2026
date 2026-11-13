// Circular progress ring (reservoir level on the landing and on /ops).
// The ring takes the current text colour: <ProgressRing value={41} label="Reservoir 41% full" className="text-primary">41%</ProgressRing>
import { cn } from "cn";

type Props = { value: number; label: string; size?: number; stroke?: number; className?: string; children?: React.ReactNode };

export function ProgressRing({ value, label, size = 136, stroke = 12, className, children }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div role="img" aria-label={label} className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke="currentColor" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-foreground">{children}</div>
    </div>
  );
}

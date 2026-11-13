// Dial for a percentage (reservoir fill): a 270° ring of ticks, the filled ticks in blue,
// and a blue disc in the middle with the value. Decorative SVG + a text label for screen readers.
import { cn } from "cn";

const TICKS = 41;
const START = 135; // degrees, clockwise from 3 o'clock: the dial opens at the bottom

export function Gauge({ value, label, children, className }: { value: number; label: string; children?: React.ReactNode; className?: string }) {
  const filled = Math.round((Math.min(100, Math.max(0, value)) / 100) * (TICKS - 1));
  return (
    <div role="img" aria-label={label} className={cn("relative mx-auto aspect-square w-full max-w-64", className)}>
      <svg viewBox="0 0 200 200" className="size-full">
        {Array.from({ length: TICKS }, (_, i) => {
          const a = ((START + (i * 270) / (TICKS - 1)) * Math.PI) / 180;
          const long = i % 10 === 0;
          const r1 = long ? 78 : 82;
          return (
            <line
              key={i}
              x1={100 + r1 * Math.cos(a)}
              y1={100 + r1 * Math.sin(a)}
              x2={100 + 94 * Math.cos(a)}
              y2={100 + 94 * Math.sin(a)}
              strokeWidth={long ? 3 : 2.2}
              strokeLinecap="round"
              className={i <= filled ? "stroke-primary" : "stroke-primary/15"}
            />
          );
        })}
        <circle cx="100" cy="100" r="66" className="fill-primary/8" />
      </svg>
      <div className="absolute inset-[24%] grid place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,oklch(0.72_0.14_238),oklch(0.52_0.19_258))] text-white shadow-[0_14px_30px_-10px_oklch(0.5_0.19_258/0.6)]">
        {children}
      </div>
    </div>
  );
}

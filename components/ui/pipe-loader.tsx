// Loading indicator: water flowing through a pipe (replaces "Loading…" text). Transform/dash only.
import { cn } from "cn";

export function PipeLoader({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex items-center", className)}>
      <svg viewBox="0 0 120 24" className="h-6 w-28" aria-hidden>
        <rect x="2" y="6" width="112" height="12" rx="6" className="fill-muted stroke-primary/30" strokeWidth="2" />
        <line x1="8" y1="12" x2="108" y2="12" className="stroke-primary motion-safe:animate-[pipe-flow_0.8s_linear_infinite]" strokeWidth="6" strokeLinecap="round" strokeDasharray="10 8" />
        <circle cx="116" cy="12" r="2.5" className="fill-primary motion-safe:animate-[pipe-drip_1.6s_ease-in_infinite]" />
      </svg>
    </span>
  );
}

// Small diagram helpers for /ops and /driver (docs/WATER-DAY-SPLIT.md P4 item 5): a fill bar and a stop-progress bar.
// Decorative; the number next to them stays in the text for screen readers.

/** value of max as a horizontal bar. `hex` overrides the default primary colour. */
export function FillBar({ value, max, hex, className = "" }: { value: number; max: number; hex?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span aria-hidden className={`block h-2 overflow-hidden rounded-full bg-muted ${className}`}>
      <span className={`block h-full rounded-full ${hex ? "" : "bg-primary"}`} style={{ width: `${pct}%`, background: hex }} />
    </span>
  );
}

/** One segment per stop, in route order: served = green, next unserved = primary, later = muted. */
export function StopProgress({ served, className = "" }: { served: boolean[]; className?: string }) {
  if (!served.length) return null;
  const next = served.indexOf(false);
  return (
    <span aria-hidden className={`flex h-2 gap-0.5 ${className}`}>
      {served.map((done, i) => (
        <span key={i} className={`h-full flex-1 rounded-full ${done ? "bg-emerald-600" : i === next ? "bg-primary" : "bg-muted"}`} />
      ))}
    </span>
  );
}

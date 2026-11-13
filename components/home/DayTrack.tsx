// Schedule vs reality, drawn: today as one 24 h track. Blue band = official CWA
// window, marks above it = what neighbours on this street reported, line = now.
// Decorative for screen readers: Home says the same in text next to it.
import type { ReportType } from "@/lib/queries";
import { minOfDay, toMin } from "@/components/home/time";

export type TodayReport = { type: ReportType; created_at: string };

const pct = (min: number) => `${(min / 1440) * 100}%`;
const HOURS = [0, 6, 12, 18, 24];
const dot = { water_on: "bg-emerald-600", water_off: "border-2 border-red-600 bg-card" }; // shape + colour, not colour alone

export function DayTrack({ start, end, reports, now }: { start: string; end: string; reports: TodayReport[]; now: Date | null }) {
  const s = toMin(start);
  const e = Math.max(toMin(end), s);
  return (
    <div aria-hidden className="mt-5">
      <div className="relative h-9">
        <div className="absolute inset-x-0 bottom-0 h-3 rounded-full bg-muted" />
        <div className="absolute bottom-0 h-3 rounded-full bg-primary" style={{ left: pct(s), width: pct(e - s) }} />
        {reports.map((r, i) => (
          <span key={i} className={`absolute top-1 size-2.5 -translate-x-1/2 rounded-full ${dot[r.type]}`} style={{ left: pct(minOfDay(new Date(r.created_at))) }} />
        ))}
        {now && <span className="absolute -bottom-1 h-5 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: pct(minOfDay(now)) }} />}
      </div>
      <div className="relative mt-2 h-4 text-[0.6875rem] text-muted-foreground tabular-nums">
        {HOURS.map((h) => (
          <span key={h} className={`absolute ${h === 0 ? "" : h === 24 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: pct(h * 60) }}>
            {String(h).padStart(2, "0")}
          </span>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-primary" />Official window</li>
        <li className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${dot.water_on}`} />Water reported</li>
        <li className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${dot.water_off}`} />No water reported</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-0.5 rounded-full bg-foreground" />Now</li>
      </ul>
    </div>
  );
}

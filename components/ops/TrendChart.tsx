"use client";

// Reservoir prediction chart for /ops (op 25; docs/WATER-DAY-SPLIT.md P4 item 2). Inline SVG, no chart library.
// Solid = published readings, dashed = straight-line projection, horizontal lines at 30% and 20%.
// The SVG viewBox follows the container width so labels stay readable from 360 px to desktop.
// Fallback: P3's API missing -> local least-squares over data/reservoir.csv (Mare aux Vacoas only).
import { useEffect, useRef, useState } from "react";
import { loadTrend, PRESS_20PCT, type Trend } from "@/components/ops/forecast";

const DAY = 86_400_000;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;
const fmtDay = (n: number) => new Date(Math.round(n) * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const H = 230, PAD = { l: 36, r: 14, t: 14, b: 26 };

export function TrendChart({ reservoirs, now }: { reservoirs: string[]; now: number }) {
  const [name, setName] = useState("Mare aux Vacoas");
  const [state, setState] = useState<{ name: string; trend: Trend | null; fromApi: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);

  useEffect(() => {
    let off = false;
    loadTrend(name).then((r) => { if (!off) setState({ name, ...r }); });
    return () => { off = true; };
  }, [name]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const options = [...new Set(["Mare aux Vacoas", ...reservoirs])];
  const loading = !state || state.name !== name;
  const t = loading ? null : state.trend;

  return (
    <section className="surface flex flex-col gap-3 p-4 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Reservoir trend <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Estimate</span></h2>
        <select aria-label="Reservoir" className="min-h-11 rounded-xl border bg-card px-2 text-sm" value={name} onChange={(e) => setName(e.target.value)}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div ref={box} className="w-full">
        {loading ? <div className="h-[230px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /> : t && t.points.length >= 2 ? <Chart t={t} w={w} now={now} /> : (
          <p className="grid h-[120px] place-items-center rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">
            Not enough recent readings for {name} to draw a trend yet.
          </p>
        )}
      </div>
      {t && now > 0 && <Summary t={t} fromApi={state?.fromApi ?? false} now={now} />}
    </section>
  );
}

function Chart({ t, w, now }: { t: Trend; w: number; now: number }) {
  const x0 = dayNum(t.latest_day);
  const fit0 = t.projection[0]?.level_pct ?? t.latest_pct;
  const slope = t.pct_per_day;
  const cross20 = slope < 0 ? x0 + (20 - fit0) / slope : null;
  const start = dayNum(t.points[0].day);
  const end = Math.max(x0 + 30, cross20 !== null && cross20 - x0 <= 150 ? cross20 + 12 : 0);
  const yMax = Math.ceil((Math.max(...t.points.map((p) => p.level_pct)) + 5) / 10) * 10;
  const X = (d: number) => PAD.l + ((d - start) / (end - start)) * (w - PAD.l - PAD.r);
  const Y = (p: number) => PAD.t + (1 - p / yMax) * (H - PAD.t - PAD.b);
  const fitAt = (d: number) => Math.max(0, fit0 + slope * (d - x0));
  const today = Math.floor((now - new Date(now).getTimezoneOffset() * 60_000) / DAY);

  const solid = t.points.map((p) => `${X(dayNum(p.day)).toFixed(1)},${Y(p.level_pct).toFixed(1)}`).join(" ");
  const months: number[] = [];
  for (let d = new Date(Math.round(start) * DAY); d.getTime() / DAY <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY;
    if (m > start) months.push(m);
  }
  const showCross = cross20 !== null && cross20 <= end;

  return (
    <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} role="img" className="block overflow-visible text-[11px]"
      aria-label={`${t.reservoir}: readings from ${t.points[0].level_pct}% to ${t.latest_pct}%, falling ${Math.abs(slope)}% per day${t.days_to_20 != null ? `, 20% in about ${t.days_to_20} days` : ""}. Estimate.`}>
      {Array.from({ length: yMax / 10 + 1 }, (_, i) => i * 10).map((p) => (
        <g key={p}>
          <line x1={PAD.l} x2={w - PAD.r} y1={Y(p)} y2={Y(p)} className="stroke-border" strokeWidth="1" />
          <text x={PAD.l - 6} y={Y(p) + 4} textAnchor="end" className="fill-muted-foreground tabular-nums">{p}%</text>
        </g>
      ))}
      {months.map((m) => (
        <text key={m} x={X(m)} y={H - 8} textAnchor="middle" className="fill-muted-foreground">
          {new Date(m * DAY).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
        </text>
      ))}
      {[{ p: 30, cls: "stroke-amber-600", txt: "30% critical (demo tier)" }, { p: 20, cls: "stroke-red-600", txt: "20%" }].map((l) => (
        <g key={l.p}>
          <line x1={PAD.l} x2={w - PAD.r} y1={Y(l.p)} y2={Y(l.p)} className={l.cls} strokeWidth="1.5" strokeDasharray="6 4" />
          <text x={w - PAD.r} y={Y(l.p) - 5} textAnchor="end" className={l.p === 20 ? "fill-red-700 font-semibold" : "fill-amber-800"}>{l.txt}</text>
        </g>
      ))}
      {today > start && today < end && (
        <g>
          <line x1={X(today)} x2={X(today)} y1={PAD.t} y2={H - PAD.b} className="stroke-foreground/40" strokeWidth="1" strokeDasharray="2 3" />
          <text x={X(today) + 4} y={PAD.t + 10} className="fill-muted-foreground">today</text>
        </g>
      )}
      <line x1={X(x0)} y1={Y(fit0)} x2={X(end)} y2={Y(fitAt(end))} className="stroke-primary" strokeWidth="2.5" strokeDasharray="7 6" strokeLinecap="round" />
      <polyline points={solid} fill="none" className="stroke-primary" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {t.points.map((p) => <circle key={p.day} cx={X(dayNum(p.day))} cy={Y(p.level_pct)} r="3.5" className="fill-card stroke-primary" strokeWidth="2" />)}
      {showCross && (
        <g>
          <circle cx={X(cross20!)} cy={Y(20)} r="5.5" className="fill-red-600 stroke-card" strokeWidth="2" />
          <text x={X(cross20!)} y={Y(20) + 18} textAnchor={X(cross20!) > w - 90 ? "end" : "middle"} className="fill-red-700 font-semibold">~{t.days_to_20 != null && now ? new Date(now + t.days_to_20 * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : fmtDay(cross20!)}</text>
        </g>
      )}
    </svg>
  );
}

function Summary({ t, fromApi, now }: { t: Trend; fromApi: boolean; now: number }) {
  const when = (days: number) => new Date(now + days * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const falling = t.pct_per_day < 0;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-base font-semibold">
        {t.days_to_20 != null
          ? `${t.reservoir} reaches 20% in ~${t.days_to_20} days (estimate, around ${when(t.days_to_20)})`
          : t.points.length < 3 ? `${t.reservoir}: fewer than 3 readings, no date estimated`
          : `${t.reservoir} is not falling: no date to 20%`}
      </p>
      <p className="text-muted-foreground">
        {t.days_to_30 != null && (t.days_to_30 === 0 ? "Already under 30%. " : `30% in ~${t.days_to_30} days. `)}
        Straight line through {t.points.length} published readings ({t.points[0].day} to {t.latest_day}), {falling ? "falling" : "rising"} {Math.abs(t.pct_per_day).toFixed(2)}% per day.
        {" "}Assumes no heavy rain and no change in use.
      </p>
      {/vacoas/i.test(t.reservoir) && (
        <p className="text-xs text-muted-foreground">
          <a className="text-primary underline" href={PRESS_20PCT.url} target="_blank" rel="noreferrer">{PRESS_20PCT.text}</a>.
          {" "}Our line is slower than the press figure. Both are estimates; we show the gap instead of hiding it.
        </p>
      )}
      <p className="text-xs text-muted-foreground">{fromApi ? "Model: /api/reservoirs/trend." : "Computed in the browser from data/reservoir.csv (forecast API not live yet)."} A storage level never says whether tap water is safe to drink.</p>
    </div>
  );
}

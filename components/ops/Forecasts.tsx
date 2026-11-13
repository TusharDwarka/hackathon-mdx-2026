"use client";

// Next water window per area for /ops (op 24; docs/WATER-DAY-SPLIT.md P4 item 3).
// Lets dispatch see which areas wait longest or have only a weak estimate, and plan tankers there first.
// Official CWA windows show "Official CWA" + source; everything else is labelled Estimate with its basis.
// Fallback: P3's API missing -> local rule over the timetable (components/ops/forecast.ts); demo -> sample timetable.
import { useEffect, useState } from "react";
import { loadSchedule } from "@/components/map/data";
import { demoSchedule } from "@/components/map/demo";
import { hoursUntil, loadForecast, needsTankers, type Forecast } from "@/components/ops/forecast";
import type { OpsData } from "@/components/ops/data";
import { PipeLoader } from "@/components/ui/pipe-loader";

const BASIS: Record<Forecast["basis"], string> = { official: "Official CWA", every_second_day: "Every second day", history: "Past reports" };
const CONF: Record<Forecast["confidence"], string> = { high: "bg-emerald-100 text-emerald-900", medium: "bg-amber-100 text-amber-900", low: "bg-red-100 text-red-900" };
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const inH = (h: number) => (h < 0 ? "now" : h < 48 ? `in ${Math.round(h)} h` : `in ${Math.round(h / 24)} days`);

type Row = { area_id: number; name: string; forecast: Forecast | null; fromApi: boolean };

export function Forecasts({ data, now }: { data: OpsData; now: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const tier = data.reservoir?.tier ?? null;

  useEffect(() => {
    let off = false;
    (async () => {
      const schedule = data.demo ? demoSchedule() : await loadSchedule().catch(() => []);
      const out = await Promise.all(Object.entries(data.areaNames).map(async ([id, name]) => ({ area_id: Number(id), name, ...(await loadForecast(Number(id), schedule, tier, data.demo)) })));
      if (!off) setRows(out);
    })();
    return () => { off = true; };
  }, [data.areaNames, data.demo, tier]);

  const at = new Date(now);
  // Areas to plan tankers for first, then the soonest window. Waits for the page clock (now > 0).
  const sorted = !rows || !now ? null : [...rows].sort((a, b) =>
    Number(needsTankers(b.forecast, at)) - Number(needsTankers(a.forecast, at))
    || (a.forecast ? hoursUntil(a.forecast, at) : 1e9) - (b.forecast ? hoursUntil(b.forecast, at) : 1e9));
  const flagged = sorted?.filter((r) => needsTankers(r.forecast, at)).length ?? 0;

  return (
    <section className="surface flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Next water window per area</h2>
      {sorted ? <p className="text-xs text-muted-foreground">{flagged ? `${flagged} area${flagged === 1 ? "" : "s"} may need tankers.` : "Every area gets water within 36 h."}</p> : <PipeLoader />}
      <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {sorted?.map((r) => {
          const f = r.forecast;
          const plan = needsTankers(f, at);
          return (
            <li key={r.area_id} className={`flex flex-col gap-1 rounded-2xl border p-3 text-sm ${plan ? "border-amber-300 bg-amber-50/60" : ""}`}>
              <p className="flex flex-wrap items-center justify-between gap-2">
                <b>{r.name}</b>
                {plan && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">Plan tankers</span>}
              </p>
              {f ? (
                <>
                  <p className="text-base font-semibold tabular-nums">{fmtDay(f.next.day)} · {f.next.start_time} to {f.next.end_time} <span className="text-sm font-normal text-muted-foreground">({inH(hoursUntil(f, at))})</span></p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs">
                    {f.basis === "official" && f.source_url
                      ? <a className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-900 underline" href={f.source_url} target="_blank" rel="noreferrer">Official CWA</a>
                      : f.basis === "official" ? <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">Sample timetable (demo)</span>
                      : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">Estimate · {BASIS[f.basis]}</span>}
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${CONF[f.confidence]}`}>{f.confidence} confidence</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{f.note}.{f.basis !== "official" && f.source_url && <> <a className="text-primary underline" href={f.source_url} target="_blank" rel="noreferrer">last notice</a></>}</p>
                </>
              ) : (
                <p className="text-muted-foreground">No timetable for this area: no estimate.</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {rows?.some((r) => r.fromApi) ? "From /api/forecast." : "Local rule over the CWA timetable (forecast API not live yet)."} An estimate never overrides an official CWA window.
      </p>
    </section>
  );
}

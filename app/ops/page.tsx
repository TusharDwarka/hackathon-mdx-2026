"use client";

// CWA operations screen (SPEC V2 screen 5; contracts/api.md ops 11, 12, 14, 15, 17).
// Desktop first (3-column grid from lg), single column on a phone. No login.
// Rules are plain functions in components/ops/rules.ts; reads in components/ops/data.ts.
// Fallback: database unreachable or no streets loaded -> demo sample with a visible banner.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HEAT_LEGEND, HeatMap, heatHex } from "@/components/home/HeatMap";
import { supabase } from "@/lib/supabase";
import { CATEGORY_LABEL, demoOps, loadOpenComplaints, loadOps, resolveComplaint, SAMPLE_RESERVOIR, type OpsData } from "@/components/ops/data";
import type { Tier, Trust } from "@/components/ops/rules";

const card = "rounded-xl border bg-card p-4 flex flex-col gap-3";
const TIER: Record<Tier, { label: string; style: string }> = {
  normal: { label: "Normal", style: "bg-emerald-100 text-emerald-900" },
  watch: { label: "Watch", style: "bg-amber-100 text-amber-900" },
  critical: { label: "Critical", style: "bg-red-100 text-red-900" },
};
const ACTION_STYLE = {
  "send tanker": "bg-sky-100 text-sky-900",
  "place a static tank": "bg-red-100 text-red-900",
  watch: "bg-zinc-100 text-zinc-700",
} as const;
const TRUST: Record<Trust, string> = { confirmed: "Confirmed", unconfirmed: "Unconfirmed", suspect: "Suspect", none: "No recent reports" };

const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
};
const hours = (h: number | null) => (h == null ? "no reports" : h < 1 ? "under 1 h" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

export default function OpsPage() {
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    loadOps()
      .then(setData)
      .catch((e) => { setError(e instanceof Error ? e.message : String(e)); setData(demoOps()); })
      .finally(() => setNow(Date.now()));
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(clock);
  }, []);

  // Op 14 live: a new complaint from /resident appears without a refresh.
  const demo = data?.demo ?? false;
  useEffect(() => {
    if (!data || demo) return;
    const ch = supabase.channel("ops-complaints").on("postgres_changes", { event: "*", schema: "public", table: "complaints" }, () => {
      loadOpenComplaints().then((complaints) => setData((d) => (d ? { ...d, complaints } : d))).catch(() => {});
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, data !== null]);

  async function resolve(id: number) {
    setData((d) => (d ? { ...d, complaints: d.complaints.filter((c) => c.id !== id) } : d));
    if (demo) return;
    try { await resolveComplaint(id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  if (!data) return <main className="p-6 text-lg text-zinc-500">Loading…</main>;

  const name = (id: number) => data.streets.find((s) => s.id === id)?.name ?? `Street ${id}`;
  const reservoir = data.reservoir ?? SAMPLE_RESERVOIR;
  const reservoirIsSample = data.demo || !data.reservoir;
  const suspects = data.statuses.filter((s) => s.status === "suspect");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">CWA operations · Vacoas</h1>
          <p className="text-sm text-zinc-500">Rule-based view of the last reports, requests and complaints. Stored by street only.</p>
        </div>
        <nav className="flex gap-3 text-sm text-sky-700 underline">
          <Link href="/resident">Resident</Link>
          <Link href="/map">Map</Link>
          <Link href="/driver">Driver</Link>
        </nav>
      </header>
      {error && (
        <p className="rounded bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
          Demo mode: sample data, nothing is saved. ({error})
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Op 12 */}
        <section className={card}>
          <h2 className="font-semibold">Reservoir status</h2>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold tabular-nums">{reservoir.level_pct}%</span>
            <span className={`mb-2 rounded-full px-3 py-1 text-sm font-semibold ${TIER[reservoir.tier].style}`}>{TIER[reservoir.tier].label}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, reservoir.level_pct)}%` }} />
          </div>
          <p className="text-sm text-zinc-600">
            {reservoir.reservoir} · {reservoir.day}
            {reservoir.source_url && (
              <> · <a className="underline" href={reservoir.source_url} target="_blank" rel="noreferrer">source</a></>
            )}
          </p>
          <p className="text-xs text-zinc-500">
            Tiers are demo thresholds: 60%+ normal, 30 to 60% watch, under 30% critical.
            {reservoirIsSample && " Sample figure until daily levels are loaded."}
          </p>
        </section>

        {/* Op 11 */}
        <section className={`${card} lg:col-span-2`}>
          <h2 className="font-semibold">Hours without water, per street</h2>
          <HeatMap streets={data.streets} hoursDry={data.hoursDry} myStreetId={null} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
            {HEAT_LEGEND.map((l) => (
              <li key={l.label} className="flex items-center gap-1">
                <span className="inline-block size-3 rounded-full" style={{ background: l.hex }} /> {l.label}
              </li>
            ))}
          </ul>
        </section>

        {/* Op 17 */}
        <section className={`${card} lg:col-span-2`}>
          <h2 className="font-semibold">Priority list</h2>
          <p className="text-xs text-zinc-500">Score = hours dry + 12 × waiting tanker requests. Highest first.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-1">Street</th>
                <th className="py-1">Dry for</th>
                <th className="py-1">Waiting</th>
                <th className="py-1 text-right">Score</th>
                <th className="py-1 pl-3">Suggested action</th>
              </tr>
            </thead>
            <tbody>
              {data.priorities.map((p) => (
                <tr key={p.street_id} className="border-t">
                  <td className="py-2 font-medium">
                    <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: heatHex(p.hours_dry) }} />
                    {name(p.street_id)}
                  </td>
                  <td className="py-2">{hours(p.hours_dry)}</td>
                  <td className="py-2">{p.waiting || "–"}</td>
                  <td className="py-2 text-right tabular-nums">{p.score}</td>
                  <td className="py-2 pl-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_STYLE[p.action]}`}>{p.action}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Op 14 */}
        <section className={card}>
          <h2 className="font-semibold">Open complaints <span className="text-zinc-400">({data.complaints.length})</span></h2>
          {data.complaints.length === 0 && <p className="text-sm text-zinc-500">None open. New complaints appear here live.</p>}
          <ul className="flex flex-col gap-2">
            {data.complaints.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-lg border p-2">
                <div className="flex-1 text-sm">
                  <p className="font-medium">{CATEGORY_LABEL[c.category]}</p>
                  <p className="text-xs text-zinc-500">{name(c.street_id)} · {now ? ago(c.created_at, now) : ""}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => resolve(c.id)}>Resolve</Button>
              </li>
            ))}
          </ul>
        </section>

        {/* Op 15 */}
        <section className={`${card} lg:col-span-3`}>
          <h2 className="font-semibold">
            Street water status <span className="text-zinc-400">(last 3 h)</span>
            {suspects.length > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">{suspects.length} suspect</span>}
          </h2>
          <p className="text-xs text-zinc-500">
            Confirmed: 2+ reports and at least 2 of 3 agree. Suspect: one report that contradicts both neighbouring streets.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.statuses.map((s) => (
              <li key={s.street_id} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${s.status === "suspect" ? "border-red-300 bg-red-50" : ""}`}>
                <span className="font-medium">{name(s.street_id)}</span>
                <span className="text-right text-xs text-zinc-600">
                  {s.type && <span className={`mr-2 font-semibold ${s.type === "water_on" ? "text-emerald-700" : "text-red-700"}`}>{s.type === "water_on" ? "Water here" : "No water"}</span>}
                  {TRUST[s.status]}{s.reports ? ` · ${s.reports}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

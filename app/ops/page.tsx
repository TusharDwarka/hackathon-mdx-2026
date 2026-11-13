"use client";

// CWA operations screen (SPEC V2 screen 5; contracts/api.md ops 11, 12, 14, 15, 17; docs/NEXT-TASK-SPLIT.md P4 steps 5, 6, 8).
// Four sections instead of one long dashboard: Overview, Dispatch, Complaints, Report review.
// The section is kept in the URL hash (#dispatch) so a link or a reload opens the same one.
// Live: complaints, requests and rounds refresh over Realtime. No login.
// Fallback: database unreachable or no streets loaded -> demo sample with a visible banner.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errText, loadActiveRounds, loadWaitingRequests } from "@/components/map/data";
import { demoOps, loadComplaints, loadOps, prioritiesFor, type OpsData } from "@/components/ops/data";
import { Overview, type Section } from "@/components/ops/Overview";
import { DispatchPanel } from "@/components/ops/DispatchPanel";
import { Complaints } from "@/components/ops/Complaints";
import { Review } from "@/components/ops/Review";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "dispatch", label: "Dispatch" },
  { id: "complaints", label: "Complaints" },
  { id: "review", label: "Report review" },
];
const isSection = (s: string): s is Section => SECTIONS.some((x) => x.id === s);

export default function OpsPage() {
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [section, setSection] = useState<Section>("overview");

  useEffect(() => {
    const fromHash = () => { const h = window.location.hash.slice(1); if (isSection(h)) setSection(h); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    loadOps()
      .then(setData)
      .catch((e) => { setError(errText(e)); setData(demoOps()); })
      .finally(() => setNow(Date.now()));
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(clock); window.removeEventListener("hashchange", fromHash); };
  }, []);

  const go = useCallback((s: Section) => {
    setSection(s);
    window.history.replaceState(null, "", `#${s}`);
  }, []);

  // Live updates: a complaint from /resident, a new request, a round started or served on /driver.
  const live = data !== null && !data.demo;
  useEffect(() => {
    if (!live) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const later = (fn: () => Promise<void>) => () => { clearTimeout(t); t = setTimeout(() => { fn().catch(() => {}); }, 700); };
    const complaints = async () => { const c = await loadComplaints(); setData((d) => (d ? { ...d, complaints: c } : d)); };
    const demand = async () => {
      const [waiting, rounds] = await Promise.all([loadWaitingRequests(), loadActiveRounds()]);
      setData((d) => (d ? { ...d, waiting, rounds, priorities: prioritiesFor(d.streets, d.hoursDry, waiting) } : d));
    };
    const ch = supabase
      .channel("ops-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints" }, later(complaints))
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, later(demand))
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, later(demand))
      .on("postgres_changes", { event: "*", schema: "public", table: "round_stops" }, later(demand))
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [live]);

  if (!data) return <main className="p-6 text-lg text-muted-foreground">Loading…</main>;

  const name = (id: number) => data.streets.find((s) => s.id === id)?.name ?? `Street ${id}`;
  const area = (streetId: number) => { const s = data.streets.find((x) => x.id === streetId); return (s && data.areaNames[s.area_id]) || "Unknown area"; };
  const areaTitle = [...new Set(Object.values(data.areaNames))].join(", ");
  const counts: Partial<Record<Section, number>> = {
    complaints: data.complaints.filter((c) => c.status === "open").length,
    review: data.statuses.filter((s) => s.status === "suspect" || s.status === "unconfirmed").length,
    dispatch: new Set(data.waiting.map((w) => w.street_id)).size,
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">CWA operations{areaTitle ? ` · ${areaTitle}` : ""}</h1>
        <p className="text-sm text-muted-foreground">Rule-based view of reports, requests and complaints. Stored by street only.</p>
      </header>
      {error && <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">Demo mode: sample data, nothing is saved. ({error})</p>}

      <div role="tablist" aria-label="Operations sections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            id={`tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            aria-controls={`panel-${s.id}`}
            onClick={() => go(s.id)}
            className="chip min-h-11 shrink-0 shadow-card transition-colors duration-150 ease-snap aria-selected:bg-primary aria-selected:text-primary-foreground motion-reduce:transition-none"
          >
            {s.label}
            {counts[s.id] ? <span className="rounded-full bg-current/15 px-1.5 text-xs tabular-nums">{counts[s.id]}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${section}`} aria-labelledby={`tab-${section}`}>
        {section === "overview" && <Overview data={data} go={go} now={now} />}
        {section === "dispatch" && <DispatchPanel data={data} name={name} setRounds={(rounds) => setData((d) => (d ? { ...d, rounds } : d))} />}
        {section === "complaints" && (
          <Complaints data={data} now={now} name={name} area={area} setComplaints={(fn) => setData((d) => (d ? { ...d, complaints: fn(d.complaints) } : d))} />
        )}
        {section === "review" && <Review data={data} name={name} />}
      </div>
    </main>
  );
}

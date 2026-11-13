"use client";

// CWA operations screen. Five sections (Overview, Dispatch, Complaints, Reports, Notices), kept in the
// URL hash (#dispatch) so a link or a reload opens the same one. Live over Realtime.
// Fallback: database unreachable or no streets loaded -> demo sample with a visible banner.
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, FileText, LayoutDashboard, MessageSquareWarning, Truck, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errText, loadActiveRounds, loadWaitingRequests } from "@/components/map/data";
import { demoOps, loadComplaints, loadOps, prioritiesFor, type OpsData } from "@/components/ops/data";
import { Overview, type Section } from "@/components/ops/Overview";
import { DispatchPanel } from "@/components/ops/DispatchPanel";
import { Complaints } from "@/components/ops/Complaints";
import { Review } from "@/components/ops/Review";
import { NoticePaste } from "@/components/ops/NoticePaste";
import { PageHeader } from "@/components/ui/brand";
import { PipeLoader } from "@/components/ui/pipe-loader";

const SECTIONS: { id: Section; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "dispatch", label: "Dispatch", Icon: Truck },
  { id: "complaints", label: "Complaints", Icon: MessageSquareWarning },
  { id: "review", label: "Reports", Icon: ClipboardCheck },
  { id: "notices", label: "Notices", Icon: FileText },
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
    window.scrollTo({ top: 0 });
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

  if (!data) return <main className="grid min-h-[60dvh] place-items-center"><PipeLoader /></main>;

  const name = (id: number) => data.streets.find((s) => s.id === id)?.name ?? `Street ${id}`;
  const area = (streetId: number) => { const s = data.streets.find((x) => x.id === streetId); return (s && data.areaNames[s.area_id]) || "—"; };
  const counts: Partial<Record<Section, number>> = {
    complaints: data.complaints.filter((c) => c.status === "open").length,
    review: data.statuses.filter((s) => s.status === "suspect" || s.status === "unconfirmed").length,
    dispatch: new Set(data.waiting.map((w) => w.street_id)).size,
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-5 pb-6 md:max-w-3xl lg:max-w-6xl lg:px-8 lg:pt-8">
      <PageHeader eyebrow="CWA staff" title="Operations" />
      {error && <p className="rounded-2xl bg-amber-100 px-4 py-2.5 text-sm text-amber-950">Demo mode: sample data, nothing is saved.</p>}

      <div role="tablist" aria-label="Operations sections" className="sticky top-0 z-30 -mx-4 grid grid-cols-5 gap-1 bg-background/90 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:flex lg:gap-2 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={section === id}
            aria-controls={`panel-${id}`}
            onClick={() => go(id)}
            className="relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-card px-1 text-[0.6875rem] font-semibold shadow-card transition-colors duration-150 ease-snap aria-selected:bg-primary aria-selected:text-primary-foreground lg:min-h-11 lg:flex-row lg:gap-2 lg:px-4 lg:text-sm motion-reduce:transition-none"
          >
            <Icon aria-hidden className="size-5 lg:size-4" />
            <span className="max-w-full truncate">{label}</span>
            {counts[id] ? <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[0.625rem] leading-5 text-white tabular-nums lg:static lg:bg-current/15 lg:text-current">{counts[id]}</span> : null}
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
        {section === "notices" && <NoticePaste />}
      </div>
    </main>
  );
}

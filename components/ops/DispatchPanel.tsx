"use client";

// /ops Dispatch: CWA staff assign waiting streets to ONE tanker. 1 pick streets, 2 pick a free tanker, 3 send.
// Only then does that tanker's driver see a round on /driver (drivers never pick up requests by themselves).
// Live: POST /api/dispatch {tanker_id, dispatch_key, street_ids}. Demo (no database): a hand-off in this browser.
// Built for a phone first: one column, big rows, the selection and the next step pinned above the tab bar.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Map as MapIcon, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { heatHex } from "@/components/home/HeatMap";
import { FillBar, StopProgress } from "@/components/ops/Bars";
import { getTankers, roundAction, type Tanker } from "@/lib/queries";
import { demandByStreet, errText, loadActiveRounds, type LiveRound } from "@/components/map/data";
import { demoRounds, readDemoDispatch, saveDemoDispatch } from "@/components/map/demo";
import { DEMO_TANK_L, fmtL, planDispatch, tankerName, type Demand } from "@/components/ops/dispatch";
import type { OpsData } from "@/components/ops/data";

// randomUUID needs https or localhost; a phone on plain http over wifi gets the fallback.
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const dryFor = (h: number | null) => (h == null ? "no reports" : h < 1 ? "dry < 1 h" : h < 48 ? `dry ${Math.round(h)} h` : `dry ${Math.round(h / 24)} days`);
const DEMO_FLEET: Tanker[] = [0, 1].map((i) => ({ id: i + 1, name: tankerName(i), capacity_litres: DEMO_TANK_L, active: true }));
const REFUSED: Record<string, string> = {
  tanker_busy: "That tanker already has a round. Pick another one, or cancel its round below.",
  no_outstanding_demand: "Those streets are already covered by another round.",
  unknown_tanker: "That tanker is not in service.",
};
// How far to trust a street's demand before sending a truck: more households asking = more likely real.
// One household with no "no water" report behind it could be a mistake or a prank: check first.
function confidence(households: number, hoursDry: number | null): { label: string; cls: string } {
  if (households >= 3) return { label: "High confidence", cls: "bg-emerald-100 text-emerald-900" };
  if (households === 2 || hoursDry != null) return { label: "Medium confidence", cls: "bg-amber-100 text-amber-900" };
  return { label: "Low confidence · check first", cls: "bg-red-100 text-red-900" };
}

type Props = { data: OpsData; name: (id: number) => string; setRounds: (r: LiveRound[]) => void };

export function DispatchPanel({ data, name, setRounds }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [fleet, setFleet] = useState<Tanker[] | null>(data.demo ? DEMO_FLEET : null);
  const [tankerId, setTankerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null); // the tanker's name
  const [key, setKey] = useState(newKey); // new key per change: a double tap reuses it

  useEffect(() => {
    if (data.demo) return;
    getTankers().then((t) => setFleet(t.filter((x) => x.active))).catch(() => setFleet([]));
  }, [data.demo]);

  const demand = useMemo(() => demandByStreet(data.waiting), [data.waiting]);
  // A street with an unserved stop on an open round is already assigned.
  const onRound = useMemo(() => new Set(data.rounds.flatMap((r) => r.stops.filter((s) => !s.served_at).map((s) => s.street_id))), [data.rounds]);
  const busy = (t: Tanker) => data.rounds.some((r) => (data.demo ? r.label === t.name : r.tanker_id === t.id));

  const changed = () => { setKey(newKey()); setError(null); setSent(null); };
  const toggle = (id: number) => { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); changed(); };
  const addable = data.priorities.filter((p) => demand[p.street_id] && !onRound.has(p.street_id));

  const rows: Demand[] = selected.flatMap((id) => {
    const st = data.streets.find((s) => s.id === id);
    const d = demand[id];
    return st && d && !onRound.has(id) ? [{ street_id: id, name: st.name, order_index: st.order_index, litres: d.litres, requests: d.requests }] : [];
  });
  const selectedL = rows.reduce((s, r) => s + r.litres, 0);
  const chosen = fleet?.find((t) => t.id === tankerId && !busy(t)) ?? null;
  // One tanker, one trip: what fits goes, the rest stays waiting for the next tanker.
  const plan = chosen && rows.length ? planDispatch(rows, 1, chosen.capacity_litres, 1) : null;
  const stops = plan?.loads[0]?.deliveries ?? [];
  const ready = !!chosen && stops.length > 0;

  async function send() {
    if (!chosen || !stops.length) return;
    try {
      if (data.demo) {
        const prev = readDemoDispatch()?.rounds ?? [];
        saveDemoDispatch({ created_at: new Date().toISOString(), rounds: [...prev, { id: -(prev.length + 1), tanker: chosen.name, stops: stops.map((d) => ({ street_id: d.street_id, litres: d.litres, trip: 1 })) }] });
        setRounds(demoRounds());
      } else {
        const res = await fetch("/api/dispatch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tanker_id: chosen.id, dispatch_key: key, street_ids: rows.map((r) => r.street_id) }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(REFUSED[body.error] ?? (res.status === 401 || res.status === 403 ? "Sign in as CWA staff first." : `error ${res.status}`));
        setRounds(await loadActiveRounds());
      }
      setSent(chosen.name);
      setSelected([]);
      setTankerId(null);
    } catch (e) {
      setError(`Not sent: ${errText(e)}`);
    }
  }

  async function cancel(r: LiveRound) {
    setError(null);
    try {
      if (data.demo) {
        const left = (readDemoDispatch()?.rounds ?? []).filter((x) => x.id !== r.round.id);
        saveDemoDispatch(left.length ? { created_at: new Date().toISOString(), rounds: left } : null);
        setRounds(left.length ? demoRounds() : []);
      } else {
        await roundAction({ action: "cancel", round_id: r.round.id });
        setRounds(await loadActiveRounds());
      }
    } catch (e) {
      setError(`Round not cancelled: ${errText(e)}`);
    }
  }
  const driverLink = `${typeof window === "undefined" ? "" : window.location.origin}/driver`;

  return (
    <div className="grid grid-cols-1 gap-4 pb-24 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:pb-0">
      {/* 1. Streets */}
      <section className="surface flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">1. Pick streets</h2>
          {addable.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => { setSelected(selected.length === addable.length ? [] : addable.map((p) => p.street_id)); changed(); }}>
              {selected.length === addable.length ? "Clear" : `Select all (${addable.length})`}
            </Button>
          )}
        </div>
        {addable.length === 0 && <p className="text-sm text-muted-foreground">No street is waiting for a tanker.</p>}
        <ul className="flex flex-col gap-2">
          {addable.map((p) => {
            const on = selected.includes(p.street_id);
            const conf = confidence(p.waiting, p.hours_dry);
            return (
              <li key={p.street_id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.street_id)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors duration-150 aria-pressed:border-primary aria-pressed:bg-primary/5"
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                    {on && <Check aria-hidden className="size-4" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{name(p.street_id)}</span>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: heatHex(p.hours_dry) }} />
                      <span className="truncate">{dryFor(p.hours_dry)} · {p.waiting} household{p.waiting === 1 ? "" : "s"}</span>
                    </span>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${conf.cls}`}>{conf.label}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{fmtL(p.litres)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {onRound.size > 0 && <p className="text-xs text-muted-foreground">{onRound.size} street{onRound.size === 1 ? " is" : "s are"} already on a round.</p>}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        {/* 2. Tanker + 3. Send */}
        <section id="dispatch-plan" className="surface flex scroll-mt-24 flex-col gap-3 p-4 lg:sticky lg:top-8" aria-live="polite">
          <h2 className="font-bold">2. Choose a tanker</h2>
          {!fleet ? <div className="h-16 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" /> : fleet.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tanker in service.</p>
          ) : (
            <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Tanker">
              {fleet.map((t) => {
                const off = busy(t);
                const on = chosen?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={off}
                      onClick={() => { setTankerId(t.id); changed(); }}
                      className="flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors duration-150 aria-checked:border-primary aria-checked:bg-primary/5 disabled:opacity-60"
                    >
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${on ? "bg-primary text-primary-foreground" : "bg-muted text-primary"}`}><Truck aria-hidden className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{t.name}</span>
                        <span className="block text-sm text-muted-foreground">{fmtL(t.capacity_litres)} tank</span>
                      </span>
                      <span className={`chip shrink-0 ${off ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{off ? "On a round" : "Free"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {plan && chosen && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="flex justify-between gap-2"><span>{fmtL(plan.total_l)} for {rows.length} street{rows.length === 1 ? "" : "s"}</span><span className="text-muted-foreground">{fmtL(chosen.capacity_litres)} tank</span></p>
              <FillBar value={plan.total_l} max={chosen.capacity_litres} hex={plan.unmet_l > 0 ? "#dc2626" : undefined} className="h-3" />
              {plan.unmet_l > 0 && <p className="rounded-xl bg-red-50 p-2.5 text-red-900"><b>{fmtL(plan.unmet_l)} does not fit.</b> Those households stay waiting for the next tanker.</p>}
            </div>
          )}

          <ConfirmButton
            size="tap"
            disabled={!ready}
            title={`Send ${chosen?.name ?? "the tanker"}?`}
            body={<p>{stops.map((d) => d.name).join(", ")} ({fmtL(plan?.assigned_l ?? 0)}). The driver sees the round at once.</p>}
            confirm="Yes, send"
            onConfirm={send}
          >
            <Send aria-hidden /> {ready ? `3. Send ${chosen!.name}` : "3. Send"}
          </ConfirmButton>
          {!ready && <p className="-mt-1 text-xs text-muted-foreground">{!rows.length ? "Pick at least one street." : "Pick a free tanker."}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {sent && (
            <div className="flex flex-col gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <p><b>Sent to {sent} ✓</b> Its driver now sees the round and taps Start.</p>
              <p className="flex flex-wrap items-center gap-2">
                <a className="chip border bg-card" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Kot Delo? ${sent}: you have a new round. ${driverLink}`)}`}>Tell the driver on WhatsApp</a>
                <button type="button" className="chip border bg-card" onClick={() => navigator.clipboard?.writeText(driverLink).catch(() => {})}>Copy link</button>
              </p>
            </div>
          )}
        </section>

        {/* Tankers with a round */}
        <section className="surface flex flex-col gap-3 p-4">
          <h2 className="font-bold">Tankers with a round <span className="text-muted-foreground">({data.rounds.length})</span></h2>
          {data.rounds.length === 0 && <p className="text-sm text-muted-foreground">No tanker has a round right now.</p>}
          <ul className="flex flex-col gap-2">
            {data.rounds.map((r) => {
              const left = r.stops.filter((s) => !s.served_at);
              const waitingStart = r.round.status === "planned";
              return (
                <li key={r.round.id} className="flex flex-col gap-1.5 rounded-2xl border p-3 text-sm">
                  <p className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">{r.label}</span>
                    <span className={`chip shrink-0 ${waitingStart ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{waitingStart ? "Driver not started" : "On the road"}</span>
                  </p>
                  <StopProgress served={r.stops.map((s) => !!s.served_at)} />
                  <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{left[0] ? `Next: ${left[0].street.name}` : "All stops served"}</span>
                    <span className="shrink-0 tabular-nums">{r.stops.length - left.length}/{r.stops.length} served</span>
                  </p>
                  <ConfirmButton size="sm" variant="outline" className="self-start" danger title={`Cancel ${r.label}'s round?`} body={left.length ? `${left.length} stop${left.length === 1 ? " goes" : "s go"} back to waiting.` : "The tanker becomes free."} confirm="Yes, cancel" onConfirm={() => cancel(r)}>
                    Cancel round
                  </ConfirmButton>
                </li>
              );
            })}
          </ul>
          {data.rounds.length > 0 && <Link className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary" href="/map"><MapIcon aria-hidden className="size-4" /> Track on the map</Link>}
        </section>
      </div>

      {/* Phones: the selection is always visible above the tab bar, one tap to the next step. */}
      {selected.length > 0 && !chosen && (
        <div className="fixed inset-x-3 bottom-[calc(var(--nav-h)+0.25rem)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-full bg-foreground py-2 pr-2 pl-5 text-background shadow-nav lg:hidden">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{selected.length} street{selected.length === 1 ? "" : "s"} · {fmtL(selectedL)}</span>
          <Button className="h-11 shrink-0 rounded-full bg-background px-5 text-foreground hover:bg-background/90" onClick={() => document.getElementById("dispatch-plan")?.scrollIntoView({ behavior: "smooth" })}>Choose tanker</Button>
        </div>
      )}
    </div>
  );
}

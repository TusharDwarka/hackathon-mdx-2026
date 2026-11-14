"use client";

// /ops Dispatch, in three steps: 1 pick streets, 2 set tankers, 3 send (with a confirm dialog).
// The plan comes from components/ops/dispatch.ts; Send goes to the allocation API (live) or a demo
// hand-off in this browser (demo). After sending, each driver gets a link (copy or WhatsApp).
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Map as MapIcon, Minus, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { heatHex } from "@/components/home/HeatMap";
import { FillBar, StopProgress } from "@/components/ops/Bars";
import { demandByStreet, errText, type LiveRound } from "@/components/map/data";
import { dispatchFromPlan, saveDemoDispatch, demoRounds } from "@/components/map/demo";
import { confirmDispatch, DEMO_TANK_L, fmtL, LIVE_TANK_L, planDispatch, type Demand, type Plan } from "@/components/ops/dispatch";
import type { OpsData } from "@/components/ops/data";

// randomUUID needs https or localhost; a phone on plain http over wifi gets the fallback.
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const dryFor = (h: number | null) => (h == null ? "no reports" : h < 1 ? "dry < 1 h" : h < 48 ? `dry ${Math.round(h)} h` : `dry ${Math.round(h / 24)} days`);

type Props = { data: OpsData; name: (id: number) => string; setRounds: (r: LiveRound[]) => void };
type Sent = { rounds: { round_id: number | null; tanker: string }[] } | null;

export function DispatchPanel({ data, name, setRounds }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [tankers, setTankers] = useState(1);
  const [capacity, setCapacity] = useState(data.demo ? DEMO_TANK_L : LIVE_TANK_L);
  const [refill, setRefill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent>(null);
  const [key, setKey] = useState(newKey); // new key per plan change: a double tap reuses it

  const demand = useMemo(() => demandByStreet(data.waiting), [data.waiting]);
  // A street with an unserved stop on an active round is already allocated.
  const onRound = useMemo(() => {
    const m: Record<number, string> = {};
    for (const r of data.rounds) for (const s of r.stops) if (!s.served_at) m[s.street_id] ??= r.label;
    return m;
  }, [data.rounds]);

  const changed = () => { setKey(newKey()); setError(null); setSent(null); };
  const toggle = (id: number) => { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); changed(); };
  const addable = data.priorities.filter((p) => demand[p.street_id] && !onRound[p.street_id]);

  const rows: Demand[] = selected.flatMap((id) => {
    const st = data.streets.find((s) => s.id === id);
    const d = demand[id];
    return st && d ? [{ street_id: id, name: st.name, order_index: st.order_index, litres: d.litres, requests: d.requests }] : [];
  });
  let plan: Plan | null = null;
  let planError: string | null = null;
  try { plan = planDispatch(rows, tankers, capacity, refill ? 2 : 1); } catch (e) { planError = errText(e); }
  const ready = !!plan && plan.loads.length > 0;
  const selectedL = rows.reduce((s, r) => s + r.litres, 0);
  const fleetL = plan ? plan.tankers * plan.capacity_l * plan.max_trips : 0;

  async function send() {
    if (!plan || !plan.loads.length) return;
    const tankerNames = [...new Set(plan.loads.map((l) => l.tanker))];
    if (data.demo) {
      saveDemoDispatch(dispatchFromPlan(plan));
      setRounds(demoRounds());
      setSent({ rounds: tankerNames.map((tanker) => ({ round_id: null, tanker })) });
      setSelected([]);
      return;
    }
    try {
      const res = await confirmDispatch(plan, key);
      setSent({ rounds: res.rounds });
      setSelected([]);
    } catch (e) {
      setError(`Not sent: ${errText(e)}. Try again.`);
    }
  }
  const driverLink = (id: number | null) => `${typeof window === "undefined" ? "" : window.location.origin}/driver${id ? `?round=${id}` : ""}`;

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:pb-0">
      {/* 1. Streets */}
      <section className="surface flex flex-col gap-3 p-4">
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
                      <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: heatHex(p.hours_dry) }} />
                      {dryFor(p.hours_dry)} · {p.waiting} request{p.waiting === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{fmtL(p.litres)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {Object.keys(onRound).length > 0 && <p className="text-xs text-muted-foreground">Already on a round: {Object.keys(onRound).map((id) => name(Number(id))).join(", ")}.</p>}
      </section>

      <div className="flex flex-col gap-4">
        {/* 2. Tankers + 3. Send */}
        <section id="dispatch-plan" className="surface flex scroll-mt-24 flex-col gap-4 p-4 lg:sticky lg:top-8" aria-live="polite">
          <h2 className="font-bold">2. Tankers</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span id="tankers-label">Tankers</span>
              <div className="flex items-center gap-1" role="group" aria-labelledby="tankers-label">
                <Button size="icon-lg" variant="outline" aria-label="One tanker less" disabled={tankers <= 1} onClick={() => { setTankers((t) => t - 1); changed(); }}><Minus /></Button>
                <span className="w-8 text-center text-lg font-bold text-foreground tabular-nums">{tankers}</span>
                <Button size="icon-lg" variant="outline" aria-label="One tanker more" disabled={tankers >= 6} onClick={() => { setTankers((t) => t + 1); changed(); }}><Plus /></Button>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Litres per tanker
              <input type="number" min={1} step={500} inputMode="numeric" className="min-h-11 w-28 rounded-xl border bg-card px-3 text-base text-foreground tabular-nums" value={capacity} onChange={(e) => { setCapacity(Number(e.target.value)); changed(); }} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-primary" checked={refill} onChange={() => { setRefill((r) => !r); changed(); }} />
              Allow a second trip
            </label>
          </div>

          {planError && <p role="alert" className="text-sm text-red-700">{planError}</p>}
          {plan && rows.length > 0 && (
            <>
              <div className="flex flex-col gap-1 text-sm">
                <p className="flex justify-between"><span>{fmtL(plan.total_l)} needed</span><span className="text-muted-foreground">{fmtL(fleetL)} available</span></p>
                <FillBar value={plan.total_l} max={fleetL} hex={plan.total_l > fleetL ? "#dc2626" : undefined} className="h-3" />
              </div>
              <ol className="flex flex-col gap-1.5 text-sm">
                {plan.loads.map((l, i) => (
                  <li key={i} className="rounded-xl bg-muted/60 p-2.5">
                    <b>{l.tanker}</b>{l.trip > 1 ? `, trip ${l.trip}` : ""} · {fmtL(l.litres)}
                    <span className="block text-xs text-muted-foreground">{l.deliveries.map((d) => d.name).join(" → ")}</span>
                  </li>
                ))}
                {plan.unmet.length > 0 && (
                  <li className="rounded-xl bg-red-50 p-2.5 text-red-900">
                    <b>{fmtL(plan.unmet_l)} not covered.</b> Add a tanker or allow a second trip.
                  </li>
                )}
              </ol>
            </>
          )}

          <ConfirmButton
            size="tap"
            disabled={!ready}
            title={`Send ${plan?.tankers ?? 0} tanker${plan?.tankers === 1 ? "" : "s"}?`}
            body={plan && (
              <ul className="flex flex-col gap-1">
                {plan.loads.map((l, i) => <li key={i}><b className="text-foreground">{l.tanker}</b>: {l.deliveries.map((d) => d.name).join(", ")} ({fmtL(l.litres)})</li>)}
              </ul>
            )}
            confirm="Yes, send"
            onConfirm={send}
          >
            <Send aria-hidden /> {ready ? `3. Send · ${fmtL(plan!.assigned_l)}` : "3. Send"}
          </ConfirmButton>
          {!ready && <p className="-mt-2 text-xs text-muted-foreground">{rows.length ? "No tanker can take a load: add a tanker." : "Pick at least one street."}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {sent && (
            <div className="flex flex-col gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">Sent ✓ Give each driver their link:</p>
              {sent.rounds.map((r) => (
                <p key={r.tanker} className="flex flex-wrap items-center gap-2">
                  <b>{r.tanker}</b>
                  <a className="chip border bg-card" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Kot Delo? ${r.tanker}: ${driverLink(r.round_id)}`)}`}>WhatsApp</a>
                  <button type="button" className="chip border bg-card" onClick={() => navigator.clipboard?.writeText(driverLink(r.round_id)).catch(() => {})}>Copy link</button>
                </p>
              ))}
            </div>
          )}
        </section>

        {/* Tankers on the road */}
        <section className="surface flex flex-col gap-3 p-4">
          <h2 className="font-bold">On the road <span className="text-muted-foreground">({data.rounds.length})</span></h2>
          {data.rounds.length === 0 && <p className="text-sm text-muted-foreground">No tanker out right now.</p>}
          <ul className="flex flex-col gap-2">
            {data.rounds.map((r) => {
              const left = r.stops.filter((s) => !s.served_at);
              return (
                <li key={r.round.id} className="rounded-2xl border p-3 text-sm">
                  <p className="flex items-center justify-between gap-2 font-semibold">{r.label}<span className="font-normal text-muted-foreground">{left.length}/{r.stops.length} left</span></p>
                  <StopProgress served={r.stops.map((s) => !!s.served_at)} className="my-1.5" />
                  {left[0] && <p className="text-xs text-muted-foreground">Next: {left[0].street.name}</p>}
                </li>
              );
            })}
          </ul>
          {data.rounds.length > 0 && <Link className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary" href="/map"><MapIcon aria-hidden className="size-4" /> Track on the map</Link>}
          {data.demo && data.rounds.length > 0 && <Button size="sm" variant="outline" className="self-start" onClick={() => { saveDemoDispatch(null); setRounds([]); setSent(null); }}>Clear the demo dispatch</Button>}
        </section>
      </div>

      {/* Phones: the selection is always visible above the tab bar, one tap to the plan. */}
      {selected.length > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(var(--nav-h)+0.25rem)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-full bg-foreground py-2 pr-2 pl-5 text-background shadow-nav lg:hidden">
          <span className="flex-1 text-sm font-semibold">{selected.length} street{selected.length === 1 ? "" : "s"} · {fmtL(selectedL)}</span>
          <Button className="h-11 rounded-full bg-background px-5 text-foreground hover:bg-background/90" onClick={() => document.getElementById("dispatch-plan")?.scrollIntoView({ behavior: "smooth" })}>Next</Button>
        </div>
      )}
    </div>
  );
}

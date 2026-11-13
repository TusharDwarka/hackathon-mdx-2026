"use client";

// /ops Dispatch (op 17 + docs/NEXT-TASK-SPLIT.md P4 step 6).
// Priority list with litres, dryness evidence and why each street ranks where it does; "Add to dispatch"
// builds a preview (loads, tankers, trips, assigned and unmet litres) from components/ops/dispatch.ts.
// Confirm goes to P3's allocation API (live) or to a demo hand-off in this browser (demo). Never table writes.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { heatHex } from "@/components/home/HeatMap";
import { demandByStreet, errText, type LiveRound } from "@/components/map/data";
import { dispatchFromPlan, saveDemoDispatch, demoRounds } from "@/components/map/demo";
import { ASSUMED_REQUEST_L, confirmDispatch, DEMO_TANK_L, fmtL, LIVE_TANK_L, planDispatch, type Demand, type Plan } from "@/components/ops/dispatch";
import type { OpsData } from "@/components/ops/data";
import type { StreetStatus } from "@/components/ops/rules";

const ACTION_STYLE = {
  "send tanker": "bg-sky-100 text-sky-900",
  "place a static tank": "bg-red-100 text-red-900",
  watch: "bg-muted text-muted-foreground",
} as const;

// randomUUID needs https or localhost; a phone on plain http over wifi gets the fallback.
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const dryFor = (h: number | null) => (h == null ? "unknown" : h < 1 ? "under 1 h" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

function evidence(s: StreetStatus | undefined): string {
  if (!s || s.status === "none") return "No reports in the last 3 h";
  const what = s.type === "water_on" ? "water is here" : "no water";
  if (s.status === "confirmed") return `Confirmed now: ${s.reports} reports say ${what}`;
  return `${s.reports === 1 ? "1 report says" : `${s.reports} mixed reports, mostly`} ${what}, unconfirmed`;
}

type Props = {
  data: OpsData;
  name: (id: number) => string;
  setRounds: (r: LiveRound[]) => void;
};

export function DispatchPanel({ data, name, setRounds }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [tankers, setTankers] = useState(1);
  const [capacity, setCapacity] = useState(data.demo ? DEMO_TANK_L : LIVE_TANK_L);
  const [refill, setRefill] = useState(false);
  const [confirm, setConfirm] = useState<{ state: "idle" | "saving" | "done" | "error"; msg?: string; rounds?: { round_id: number; tanker: string }[] }>({ state: "idle" });
  const [key, setKey] = useState(newKey); // new key per preview change: double clicks reuse it

  const demand = useMemo(() => demandByStreet(data.waiting), [data.waiting]);
  const status = useMemo(() => Object.fromEntries(data.statuses.map((s) => [s.street_id, s])), [data.statuses]);
  // A street with an unserved stop on an active round is already allocated: it cannot be added again.
  const onRound = useMemo(() => {
    const m: Record<number, string> = {};
    for (const r of data.rounds) for (const s of r.stops) if (!s.served_at) m[s.street_id] ??= r.label;
    return m;
  }, [data.rounds]);
  const assumed = Object.values(demand).some((d) => d.assumed);

  const changed = () => { setKey(newKey()); setConfirm({ state: "idle" }); };
  const toggle = (id: number) => { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); changed(); };
  const addable = data.priorities.filter((p) => demand[p.street_id] && !onRound[p.street_id]).map((p) => p.street_id);

  const rows: Demand[] = selected.flatMap((id) => {
    const st = data.streets.find((s) => s.id === id);
    const d = demand[id];
    return st && d ? [{ street_id: id, name: st.name, order_index: st.order_index, litres: d.litres, requests: d.requests }] : [];
  });
  let plan: Plan | null = null;
  let planError: string | null = null;
  try { plan = planDispatch(rows, tankers, capacity, refill ? 2 : 1); } catch (e) { planError = errText(e); }

  async function onConfirm() {
    if (!plan || !plan.loads.length) return;
    if (data.demo) {
      saveDemoDispatch(dispatchFromPlan(plan));
      setRounds(demoRounds());
      setConfirm({ state: "done", msg: "Saved for this demo, in this browser only." });
      setSelected([]);
      return;
    }
    setConfirm({ state: "saving" });
    try {
      const res = await confirmDispatch(plan, key);
      setConfirm({ state: "done", msg: "Dispatched. Send each driver their link.", rounds: res.rounds });
      setSelected([]);
    } catch (e) {
      setConfirm({ state: "error", msg: errText(e) });
    }
  }
  function clearDemo() { saveDemoDispatch(null); setRounds([]); setConfirm({ state: "idle" }); }

  const confirmBlocked = !plan ? planError : !plan.loads.length ? (rows.length ? "No tanker can take a load: add a tanker." : "Add at least one street with waiting requests.") : null;
  const num = "min-h-11 w-28 rounded-xl border bg-card px-3 tabular-nums";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Priority list */}
      <section className="surface flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Priority list</h2>
          <Button size="sm" variant="outline" disabled={!addable.length} onClick={() => { setSelected(addable); changed(); }}>
            Add all with requests ({addable.length})
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Score = hours since water was last reported + 12 × waiting requests. Highest first. Unknown dryness adds 0 and says so.
          {assumed && ` ${ASSUMED_REQUEST_L} L assumed per request until requests store litres.`}
        </p>
        <ul className="flex flex-col gap-2">
          {data.priorities.map((p) => {
            const busy = onRound[p.street_id];
            const inPlan = selected.includes(p.street_id);
            const why = busy ? `Already on ${busy}` : !demand[p.street_id] ? "No waiting requests to deliver" : null;
            return (
              <li key={p.street_id} className={`grid gap-2 rounded-2xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] ${inPlan ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="inline-block size-2.5 rounded-full" style={{ background: heatHex(p.hours_dry) }} aria-hidden />
                    <span className="font-medium">{name(p.street_id)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_STYLE[p.action]}`}>{p.action}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">score {p.score}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {p.waiting ? <b className="text-foreground">{fmtL(p.litres)} waiting ({p.waiting} request{p.waiting === 1 ? "" : "s"})</b> : "No requests"} · dry for {dryFor(p.hours_dry)} · {evidence(status[p.street_id])}
                  </p>
                  <p className="text-xs text-muted-foreground">Why here: {p.reasons.join("; ")}.</p>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <Button size="sm" variant={inPlan ? "default" : "outline"} disabled={!!why} onClick={() => toggle(p.street_id)} aria-pressed={inPlan}>
                    {inPlan ? "In dispatch ✓" : "Add to dispatch"}
                  </Button>
                  {why && <span className="text-xs text-muted-foreground">{why}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-4">
        {/* Preview */}
        <section className="surface flex flex-col gap-3 p-4 lg:sticky lg:top-[calc(var(--nav-h)+1rem)]" aria-live="polite">
          <h2 className="font-semibold">Dispatch preview</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add streets from the priority list.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {rows.map((r) => (
                <li key={r.street_id} className="chip border">
                  {r.name} · {fmtL(r.litres)}
                  <button type="button" aria-label={`Remove ${r.name}`} className="-mr-1 rounded-full p-0.5 hover:bg-muted" onClick={() => toggle(r.street_id)}><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span id="tankers-label">Tankers</span>
              <div className="flex items-center gap-1" role="group" aria-labelledby="tankers-label">
                <Button size="icon" variant="outline" aria-label="One tanker less" disabled={tankers <= 1} onClick={() => { setTankers((t) => t - 1); changed(); }}><Minus /></Button>
                <span className="w-8 text-center text-base font-semibold text-foreground tabular-nums">{tankers}</span>
                <Button size="icon" variant="outline" aria-label="One tanker more" disabled={tankers >= 6} onClick={() => { setTankers((t) => t + 1); changed(); }}><Plus /></Button>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Capacity per tank (L)
              <input type="number" min={1} step={100} inputMode="numeric" className={num} value={capacity} onChange={(e) => { setCapacity(Number(e.target.value)); changed(); }} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={refill} onChange={() => { setRefill((r) => !r); changed(); }} />
              Allow a refill and a second trip
            </label>
          </div>
          {data.demo && <p className="text-xs text-muted-foreground">Demo capacity is {DEMO_TANK_L} L so the example below shows on the sample data. A registered private tanker carries at least 5,000 L.</p>}

          {planError && <p role="alert" className="text-sm text-red-700">{planError}</p>}
          {plan && rows.length > 0 && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Demand</dt><dd className="font-semibold tabular-nums">{fmtL(plan.total_l)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tank-loads needed</dt><dd className="font-semibold tabular-nums">{plan.loads_needed}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Assigned</dt><dd className="font-semibold tabular-nums">{fmtL(plan.assigned_l)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Unmet</dt><dd className={`font-semibold tabular-nums ${plan.unmet_l ? "text-red-700" : ""}`}>{fmtL(plan.unmet_l)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Refill needed</dt><dd className="font-semibold">{plan.refill_needed ? "Yes" : "No"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Capacity</dt><dd className="font-semibold tabular-nums">{plan.tankers} × {fmtL(plan.capacity_l)}</dd></div>
              </dl>
              <ol className="flex flex-col gap-1.5 text-sm">
                {plan.loads.map((l, i) => (
                  <li key={i} className="rounded-xl bg-muted/60 p-2">
                    <b>{l.tanker}</b>, trip {l.trip}{l.trip > 1 ? " (after a refill)" : ""} · {fmtL(l.litres)} of {fmtL(plan.capacity_l)}
                    <span className="block text-xs text-muted-foreground">{l.deliveries.map((d) => `${d.name} ${fmtL(d.litres)}${d.split ? " (split)" : ""}`).join(" → ")}</span>
                  </li>
                ))}
                {plan.unmet.length > 0 && (
                  <li className="rounded-xl bg-red-50 p-2 text-red-900">
                    <b>Not covered: {fmtL(plan.unmet_l)}</b>
                    <span className="block text-xs">{plan.unmet.map((d) => `${d.name} ${fmtL(d.litres)}`).join(", ")}. Add a tanker or allow a refill.</span>
                  </li>
                )}
              </ol>
              <p className="text-xs text-muted-foreground">{plan.assumption} A street that does not fit in one tank is split into two tracked deliveries.</p>
            </>
          )}
          <p className="rounded-xl border border-dashed p-2 text-xs text-muted-foreground">
            Worked example: 6 households × 20 L = 120 L. A 100 L tank needs 2 loads. That is 2 tankers leaving at once, or 1 tanker doing 2 trips with a refill in between. Loads are not trucks.
          </p>

          <Button className="h-12" disabled={!!confirmBlocked || confirm.state === "saving"} onClick={onConfirm}>
            {confirm.state === "saving" ? "Saving…" : data.demo ? "Confirm dispatch (demo)" : "Confirm dispatch"}
          </Button>
          {confirmBlocked && rows.length > 0 && <p className="text-xs text-muted-foreground">{confirmBlocked}</p>}
          {confirm.state === "error" && <p role="alert" className="text-sm text-red-700">{confirm.msg}</p>}
          {confirm.state === "done" && (
            <p className="text-sm text-emerald-800">
              {confirm.msg}{" "}
              {confirm.rounds?.map((r) => <Link key={r.round_id} className="mr-2 underline" href={`/driver?round=${r.round_id}`}>{r.tanker}</Link>)}
            </p>
          )}
        </section>

        {/* Tankers on the road */}
        <section className="surface flex flex-col gap-3 p-4">
          <h2 className="font-semibold">Tankers on the road <span className="text-muted-foreground">({data.rounds.length})</span></h2>
          {data.rounds.length === 0 && <p className="text-sm text-muted-foreground">None right now.{data.demo ? " Confirm a dispatch to send Tanker A and B." : " Drivers start rounds on /driver."}</p>}
          <ul className="flex flex-col gap-2">
            {data.rounds.map((r) => {
              const left = r.stops.filter((s) => !s.served_at);
              const roundDemand = data.demo ? null : demandByStreet(data.waiting, r.round.started_at);
              const litres = left.reduce((sum, s) => sum + (s.litres ?? roundDemand?.[s.street_id]?.litres ?? 0), 0);
              return (
                <li key={r.round.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 text-sm">
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{left.length} of {r.stops.length} stops left{litres ? ` · ${fmtL(litres)} to deliver` : ""}{left[0] ? ` · next: ${left[0].street.name}` : ""}</p>
                  </div>
                  <Link className="chip border" href={data.demo ? "/driver" : `/driver?round=${r.round.id}`}>Driver view</Link>
                </li>
              );
            })}
          </ul>
          {data.demo && data.rounds.length > 0 && <Button size="sm" variant="outline" className="self-start" onClick={clearDemo}>Clear the demo dispatch</Button>}
        </section>
      </div>
    </div>
  );
}

// Dispatch planning for /ops (docs/NEXT-TASK-SPLIT.md, P4 step 6).
// LOCAL STAND-IN for P3's tanker-planning service, following the rules the split gives P3:
// litres everywhere, tank-loads are not trucks, a street that does not fit is split into tracked
// deliveries, demand over the fleet comes back as unmet litres (never silently overfilled).
// Pure and deterministic so the preview works before P3's API lands. Swap the import when it does.
// Self-check: npx tsx components/ops/dispatch.ts

/** Requests do not store litres yet (P3 adds them). Until then each waiting request counts as this. */
export const ASSUMED_REQUEST_L = 20;
/** Live default: CWA private tanker registration asks for at least 5 m³ (Oct 2026). 1 m³ = 1,000 L. */
export const LIVE_TANK_L = 5000;
/** Demo default, small on purpose so the 120 L -> 2 loads example shows on the demo data. */
export const DEMO_TANK_L = 100;

export type Demand = { street_id: number; name: string; order_index: number; litres: number; requests: number };
export type Delivery = { street_id: number; name: string; litres: number; split: boolean };
export type Load = { tanker: string; trip: number; litres: number; deliveries: Delivery[] };
export type Plan = {
  total_l: number;
  capacity_l: number;
  loads_needed: number;
  tankers: number;
  max_trips: number;
  loads: Load[]; // loads that have a tanker and trip
  assigned_l: number;
  unmet_l: number;
  unmet: Delivery[]; // loads with no tanker left
  refill_needed: boolean;
  assumption: string;
};

export const tankerName = (i: number) => `Tanker ${String.fromCharCode(65 + i)}`;
export const fmtL = (l: number) => `${Math.round(l).toLocaleString("en-GB")} L`;
const sum = (ds: { litres: number }[]) => ds.reduce((s, d) => s + d.litres, 0);

/**
 * Cut the demand into tank-loads in street order, then hand loads to tankers in turn:
 * load 1 -> Tanker A trip 1, load 2 -> Tanker B trip 1 (or Tanker A trip 2 when there is one tanker), ...
 * Loads beyond tankers x maxTrips stay unmet. Assumes every trip fits in the time window (not checked).
 */
export function planDispatch(demand: Demand[], tankers: number, capacityL: number, maxTrips: number): Plan {
  if (!Number.isFinite(capacityL) || capacityL <= 0) throw new Error("Tanker capacity must be more than 0 L.");
  const n = Math.max(0, Math.floor(tankers));
  const trips = Math.max(1, Math.floor(maxTrips));
  const route = demand.filter((d) => d.litres > 0).sort((a, b) => a.order_index - b.order_index);

  const chunks: Delivery[][] = [];
  let cur: Delivery[] = [];
  let room = capacityL;
  for (const d of route) {
    let left = d.litres;
    while (left > 0) {
      const take = Math.min(left, room);
      cur.push({ street_id: d.street_id, name: d.name, litres: take, split: take < d.litres });
      left -= take;
      room -= take;
      if (room <= 0) { chunks.push(cur); cur = []; room = capacityL; }
    }
  }
  if (cur.length) chunks.push(cur);

  const loads: Load[] = [];
  const unmet: Delivery[] = [];
  chunks.forEach((c, i) => {
    const trip = n > 0 ? Math.floor(i / n) + 1 : Infinity;
    if (trip > trips) unmet.push(...c);
    else loads.push({ tanker: tankerName(i % n), trip, litres: sum(c), deliveries: c });
  });

  const total = sum(route);
  const assigned = sum(loads);
  return {
    total_l: total,
    capacity_l: capacityL,
    loads_needed: chunks.length,
    tankers: n,
    max_trips: trips,
    loads,
    assigned_l: assigned,
    unmet_l: total - assigned,
    unmet,
    refill_needed: loads.some((l) => l.trip > 1),
    assumption: explainLoads(total, capacityL, chunks.length),
  };
}

/** The loads-vs-trucks sentence shown under every preview. */
export function explainLoads(totalL: number, capacityL: number, loads: number): string {
  const head = `${fmtL(totalL)} at ${fmtL(capacityL)} per tank = ${loads} load${loads === 1 ? "" : "s"}.`;
  if (loads <= 1) return `${head} One tanker, one trip.`;
  return `${head} That is ${loads} tankers leaving at once, or fewer tankers doing more trips with a refill in between. The plan does not check travel time, so a refill trip must still fit in the day.`;
}

// ---------- Confirm: P3's allocation API (not table writes from the browser) ----------

export type DispatchBody = {
  key: string; // idempotency key: the same preview confirmed twice must not allocate twice
  capacity_l: number;
  loads: { tanker: string; trip: number; deliveries: { street_id: number; litres: number }[] }[];
};
export type DispatchResult = { rounds: { round_id: number; tanker: string }[] };

export async function confirmDispatch(plan: Plan, key: string): Promise<DispatchResult> {
  const body: DispatchBody = {
    key,
    capacity_l: plan.capacity_l,
    loads: plan.loads.map((l) => ({ tanker: l.tanker, trip: l.trip, deliveries: l.deliveries.map(({ street_id, litres }) => ({ street_id, litres })) })),
  };
  let res: Response;
  try {
    res = await fetch("/api/dispatch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Could not reach the dispatch API. Check the connection and try again.");
  }
  if (res.status === 404) throw new Error("The dispatch API is not live yet (P3). Drivers can still start rounds on /driver.");
  if (!res.ok) throw new Error(`Dispatch was not saved (error ${res.status}). Try again.`);
  return (await res.json()) as DispatchResult;
}

// ---------- self-check ----------
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("dispatch.ts")) {
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } };
  const street = (id: number, litres: number): Demand => ({ street_id: id, name: `S${id}`, order_index: id, litres, requests: 1 });
  const six = [1, 2, 3, 4, 5, 6].map((id) => street(id, 20)); // 6 places x 20 L = 120 L

  ok(planDispatch([], 1, 100, 1).loads_needed === 0, "0 L -> 0 loads");
  ok(planDispatch([street(1, 100)], 1, 100, 1).loads_needed === 1, "100 L -> 1 load");

  const oneNoRefill = planDispatch(six, 1, 100, 1);
  ok(oneNoRefill.total_l === 120 && oneNoRefill.loads_needed === 2, "120 L / 100 L -> 2 loads");
  ok(oneNoRefill.unmet_l === 20 && !oneNoRefill.refill_needed, "1 tanker, no refill -> 20 L unmet");

  const oneRefill = planDispatch(six, 1, 100, 2);
  ok(oneRefill.unmet_l === 0 && oneRefill.refill_needed && oneRefill.loads[1].trip === 2, "1 tanker, refill -> 2 trips");

  const two = planDispatch(six, 2, 100, 1);
  ok(two.unmet_l === 0 && !two.refill_needed, "2 tankers -> both loads at once");
  ok(two.loads[0].tanker === "Tanker A" && two.loads[1].tanker === "Tanker B", "loads go to A then B");

  const split = planDispatch([street(1, 70), street(2, 50)], 2, 100, 1);
  const s2 = split.loads.flatMap((l) => l.deliveries).filter((d) => d.street_id === 2);
  ok(s2.length === 2 && s2.every((d) => d.split) && sum(s2) === 50, "street over the tank edge is split, litres kept");
  ok(split.loads.every((l) => l.litres <= 100), "no load over capacity");

  ok(planDispatch(six, 0, 100, 1).unmet_l === 120, "no tankers -> all unmet");
  let threw = false;
  try { planDispatch(six, 1, 0, 1); } catch { threw = true; }
  ok(threw, "zero capacity rejected");

  if (!process.exitCode) console.log("dispatch ok");
}

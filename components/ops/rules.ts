// Pure rules for /ops (contracts/api.md V2 ops 12, 15, 17). No database, no model.
// Local versions in the shapes P3's lib/queries.ts will expose; swap the imports when they land.
// Self-check: npx tsx components/ops/rules.ts

export type Tier = "normal" | "watch" | "critical";
export type Reservoir = { reservoir: string; day: string; level_pct: number; source_url: string | null; tier: Tier };
export type ReportType = "water_on" | "water_off";
export type RecentReport = { street_id: number; type: ReportType; created_at: string };
export type Trust = "confirmed" | "unconfirmed" | "suspect" | "none";
export type StreetStatus = { street_id: number; status: Trust; type: ReportType | null; reports: number };
export type Action = "send tanker" | "place a static tank" | "watch";
export type Priority = { street_id: number; hours_dry: number | null; waiting: number; score: number; action: Action };

type OrderedStreet = { id: number; order_index: number };

// Op 12. DEMO thresholds (the UI says so): >= 60 normal, 30 to 60 watch, < 30 critical.
export function reservoirTier(levelPct: number): Tier {
  return levelPct >= 60 ? "normal" : levelPct >= 30 ? "watch" : "critical";
}

// Op 15. Reports of the last 3 h per street: confirmed when >= 2 reports and >= 2/3 agree, else
// unconfirmed. A single report that contradicts both neighbours (previous and next order_index) is suspect.
export function streetStatuses(streets: OrderedStreet[], reports: RecentReport[], now = Date.now()): StreetStatus[] {
  const since = now - 3 * 3_600_000;
  const byStreet = new Map<number, ReportType[]>();
  for (const r of reports) {
    if (new Date(r.created_at).getTime() < since) continue;
    byStreet.set(r.street_id, [...(byStreet.get(r.street_id) ?? []), r.type]);
  }
  const majority = (types: ReportType[] | undefined): ReportType | null => {
    if (!types?.length) return null;
    const on = types.filter((t) => t === "water_on").length;
    return on * 2 >= types.length ? "water_on" : "water_off";
  };
  const sorted = [...streets].sort((a, b) => a.order_index - b.order_index);
  return sorted.map((s, i) => {
    const types = byStreet.get(s.id) ?? [];
    const type = majority(types);
    if (!type) return { street_id: s.id, status: "none", type: null, reports: 0 };
    const agree = types.filter((t) => t === type).length;
    if (types.length >= 2 && agree * 3 >= types.length * 2) return { street_id: s.id, status: "confirmed", type, reports: types.length };
    if (types.length === 1) {
      const prev = majority(byStreet.get(sorted[i - 1]?.id));
      const next = majority(byStreet.get(sorted[i + 1]?.id));
      if (prev && next && prev !== type && next !== type) return { street_id: s.id, status: "suspect", type, reports: 1 };
    }
    return { street_id: s.id, status: "unconfirmed", type, reports: types.length };
  });
}

// Op 17. score = hours dry + 12 x waiting requests. Action: send tanker (waiting > 0),
// place a static tank (dry > 48 h), else watch. Highest score first.
export function priorityList(streetIds: number[], hoursDry: Record<number, number | null>, waiting: Record<number, number>): Priority[] {
  return streetIds
    .map((id) => {
      const hours = hoursDry[id] ?? null;
      const w = waiting[id] ?? 0;
      const action: Action = w > 0 ? "send tanker" : (hours ?? 0) > 48 ? "place a static tank" : "watch";
      return { street_id: id, hours_dry: hours, waiting: w, score: Math.round((hours ?? 0) + 12 * w), action };
    })
    .sort((a, b) => b.score - a.score);
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("rules.ts")) {
  console.assert(reservoirTier(60) === "normal" && reservoirTier(35.7) === "watch" && reservoirTier(29.9) === "critical", "tier");

  const now = Date.now();
  const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  const streets = [1, 2, 3, 4, 5].map((id) => ({ id, order_index: id }));
  const st = streetStatuses(streets, [
    { street_id: 1, type: "water_on", created_at: at(10) }, { street_id: 1, type: "water_on", created_at: at(20) },
    { street_id: 2, type: "water_off", created_at: at(5) }, { street_id: 2, type: "water_off", created_at: at(15) },
    { street_id: 3, type: "water_on", created_at: at(8) },
    { street_id: 4, type: "water_off", created_at: at(30) },
    { street_id: 5, type: "water_on", created_at: at(500) }, // older than 3 h: ignored
  ], now);
  const by = Object.fromEntries(st.map((x) => [x.street_id, x]));
  console.assert(by[1].status === "confirmed" && by[1].type === "water_on", "two agreeing -> confirmed");
  console.assert(by[3].status === "suspect", "single report against both neighbours -> suspect");
  console.assert(by[4].status === "unconfirmed", "single report, no contradiction -> unconfirmed");
  console.assert(by[5].status === "none" && by[5].reports === 0, "old reports ignored");
  const mixed = streetStatuses([{ id: 9, order_index: 1 }], [
    { street_id: 9, type: "water_on", created_at: at(1) }, { street_id: 9, type: "water_off", created_at: at(2) }, { street_id: 9, type: "water_on", created_at: at(3) },
  ], now)[0];
  console.assert(mixed.status === "confirmed" && mixed.type === "water_on", "2 of 3 agree -> confirmed");

  const pr = priorityList([1, 2, 3], { 1: 2, 2: 50, 3: null }, { 1: 2, 3: 0 });
  console.assert(pr[0].street_id === 2 && pr[0].action === "place a static tank" && pr[0].score === 50, "dry > 48 h, no requests");
  console.assert(pr[1].street_id === 1 && pr[1].action === "send tanker" && pr[1].score === 26, "2 + 12 x 2");
  console.assert(pr[2].street_id === 3 && pr[2].action === "watch" && pr[2].score === 0, "no data -> watch");
  console.log("ops rules ok");
}

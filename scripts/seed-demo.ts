// Seeds 7 days of DEMO reports (is_demo = true) so Home's "schedule vs reality",
// reliability score and heat map have something to show. Stored by street only.
// Needs streets + schedule already loaded (npm run load-data).
//
// Run:      node --env-file=.env.local --import tsx scripts/seed-demo.ts
// Dry run:  npx tsx scripts/seed-demo.ts --dry-run   (no database; prints what would be inserted)
//
// Deterministic (seeded random) so every run produces the same story:
// most days on time, some late, a few with no water at all, later streets worse than earlier ones.
import { MOCK_STREETS } from "../lib/mock";
import type { Street } from "../lib/queries";

type Win = { area_id: number; day: string; start_time: string; end_time: string };
type DemoReport = { street_id: number; type: "water_on" | "water_off"; created_at: string; is_demo: true };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = 7;

// Small seeded RNG (mulberry32): same seed -> same demo data.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function at(day: Date, hhmm: string, plusMin = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m + plusMin, 0, 0);
  return d;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Pure: builds the demo reports for the last DAYS days (yesterday back). */
export function buildDemoReports(streets: Street[], windows: Win[], now = new Date()): DemoReport[] {
  const rand = rng(2026);
  const out: DemoReport[] = [];
  const push = (street_id: number, type: DemoReport["type"], when: Date) => {
    if (when < now) out.push({ street_id, type, created_at: when.toISOString(), is_demo: true });
  };

  for (let i = DAYS; i >= 1; i--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);

    streets.forEach((s, idx) => {
      const w = windows.find((x) => x.area_id === s.area_id && (x.day === DAY_NAMES[day.getDay()] || x.day === iso(day)));
      // Streets further along the route get water later and less often (realistic for a gravity network).
      const worse = idx / Math.max(1, streets.length - 1); // 0 (first street) .. 1 (last street)
      const roll = rand();

      if (!w) {
        // No official window that day: one "no water" report somewhere in the morning.
        if (roll < 0.5) push(s.id, "water_off", at(day, "07:00", Math.floor(rand() * 120)));
        return;
      }
      const lenMin = (at(day, w.end_time).getTime() - at(day, w.start_time).getTime()) / 60_000;

      if (roll < 0.65 - 0.3 * worse) {
        // ON TIME: water arrives inside the window, goes off again a few hours after the window.
        push(s.id, "water_on", at(day, w.start_time, Math.floor(rand() * lenMin * 0.6)));
        push(s.id, "water_off", at(day, w.end_time, 60 + Math.floor(rand() * 180)));
      } else if (roll < 0.9 - 0.1 * worse) {
        // LATE: neighbours report "no water" during the window; water comes 1-4 h after it ends.
        push(s.id, "water_off", at(day, w.start_time, 15 + Math.floor(rand() * 45)));
        push(s.id, "water_on", at(day, w.end_time, 60 + Math.floor(rand() * 180)));
        push(s.id, "water_off", at(day, w.end_time, 300 + Math.floor(rand() * 120)));
      } else {
        // NO WATER all day: two "no water" reports.
        push(s.id, "water_off", at(day, w.start_time, 30 + Math.floor(rand() * 60)));
        push(s.id, "water_off", at(day, w.end_time, 120 + Math.floor(rand() * 240)));
      }
    });
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function summary(rows: DemoReport[], streets: Street[]) {
  const on = rows.filter((r) => r.type === "water_on").length;
  console.log(`${rows.length} demo reports (${on} water_on, ${rows.length - on} water_off) over ${DAYS} days, ${streets.length} streets.`);
  for (const s of streets) {
    const ons = rows.filter((r) => r.street_id === s.id && r.type === "water_on");
    const last = ons[ons.length - 1];
    const hours = last ? Math.round((Date.now() - new Date(last.created_at).getTime()) / 3_600_000) : null;
    console.log(`  ${s.name.padEnd(28)} water_on x${ons.length}, last ${hours === null ? "never" : hours + " h ago"}`);
  }
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    const windows: Win[] = DAY_NAMES.map((day) => ({ area_id: 1, day, start_time: "05:00", end_time: "09:00" }));
    const rows = buildDemoReports(MOCK_STREETS, windows);
    summary(rows, MOCK_STREETS);
    console.log("dry run: nothing written");
    return;
  }

  const { supabaseAdmin } = await import("../lib/supabase-server");
  const db = supabaseAdmin();
  const [{ data: streets, error: se }, { data: windows, error: we }] = await Promise.all([
    db.from("streets").select("id,area_id,name,lat,lng,order_index").order("order_index"),
    db.from("schedule").select("area_id,day,start_time,end_time"),
  ]);
  if (se) throw se;
  if (we) throw we;
  if (!streets?.length || !windows?.length) {
    console.error("No streets/schedule in the database. Run `npm run load-data` first. Stopping.");
    process.exit(1);
  }

  const rows = buildDemoReports(streets, windows.map((w) => ({ ...w, start_time: w.start_time.slice(0, 5), end_time: w.end_time.slice(0, 5) })));

  // Re-seedable: wipe old demo rows only (real reports from the demo day are kept).
  const { error: de } = await db.from("reports").delete().eq("is_demo", true);
  if (de) throw de;
  const { error: ie } = await db.from("reports").insert(rows);
  if (ie) throw ie;
  summary(rows, streets);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

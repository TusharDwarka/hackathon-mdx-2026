// Seeds DEMO data so Resident and Ops have something to show. Stored by street only.
// Needs streets + schedule already loaded (npm run load-data) and sql/v2.sql for complaints.
//
//   reports     7 past days + today, is_demo = true (mix of on time / late / no water, later streets worse),
//               plus the last 2 hours: confirmed "no water" on some streets, unconfirmed on others, and ONE lone
//               water_on report that contradicts both its neighbours (shows as "suspect" in Ops, op 15).
//   complaints  a few open ones + one resolved (op 14). The complaints table is RESET on every seed
//               (the contract gives it no is_demo flag), so run this before the demo, not during it.
//
// Run:      npm run seed-demo        (node --env-file=.env.local --import tsx scripts/seed-demo.ts)
// Dry run:  npx tsx scripts/seed-demo.ts --dry-run   (no database; prints what would be inserted)
//
// Deterministic (seeded random): every run produces the same story.
import { MOCK_STREETS } from "../lib/mock";
import { computeStreetStatus, type ComplaintCategory, type ReportType, type Street } from "../lib/queries";

type Win = { area_id: number; day: string; start_time: string; end_time: string };
type DemoReport = { street_id: number; type: ReportType; created_at: string; is_demo: true };
type DemoComplaint = { street_id: number; category: ComplaintCategory; created_at: string; status: "open" | "resolved" };

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
const minutesAgo = (now: Date, min: number) => new Date(now.getTime() - min * 60_000);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Pure: reports for the last DAYS days and today (only times before `now`). */
export function buildDemoReports(streets: Street[], windows: Win[], now = new Date()): DemoReport[] {
  const rand = rng(2026);
  const out: DemoReport[] = [];
  const push = (street_id: number, type: ReportType, when: Date) => {
    if (when < now) out.push({ street_id, type, created_at: when.toISOString(), is_demo: true });
  };

  for (let i = DAYS; i >= 0; i--) {
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

/** The street whose lone report contradicts its neighbours: the middle one (needs >= 3 streets). */
export const loneStreetIndex = (streets: Street[]) => (streets.length >= 3 ? Math.floor(streets.length / 2) : -1);

/** Pure: the last 2 hours, feeding op 15 (status with trust / suspect). */
export function buildRecentReports(streets: Street[], now = new Date()): DemoReport[] {
  const rand = rng(1113);
  const out: DemoReport[] = [];
  const push = (street_id: number, type: ReportType, min: number) =>
    out.push({ street_id, type, created_at: minutesAgo(now, min).toISOString(), is_demo: true });
  const lone = loneStreetIndex(streets);

  streets.forEach((s, idx) => {
    if (idx === lone) return push(s.id, "water_on", 20); // the lone report
    if (idx === lone - 1 || idx === lone + 1) {
      push(s.id, "water_off", 45);
      push(s.id, "water_off", 25); // both neighbours: confirmed "no water"
      return;
    }
    const roll = rand();
    if (roll < 0.35) {
      push(s.id, "water_off", 30 + Math.floor(rand() * 60));
      push(s.id, "water_off", 5 + Math.floor(rand() * 20)); // confirmed no water
    } else if (roll < 0.55) {
      push(s.id, "water_off", 10 + Math.floor(rand() * 90)); // unconfirmed (single report)
    } else if (roll < 0.7) {
      push(s.id, "water_on", 40 + Math.floor(rand() * 60));
      push(s.id, "water_on", 10 + Math.floor(rand() * 20)); // confirmed water is here
    }
    // else: quiet street, no recent report
  });
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Pure: a few complaints over the last 10 hours, one already resolved. */
export function buildDemoComplaints(streets: Street[], now = new Date()): DemoComplaint[] {
  const pick = (i: number) => streets[Math.max(0, Math.min(i, streets.length - 1))].id;
  const c = (street_id: number, category: ComplaintCategory, min: number, status: DemoComplaint["status"] = "open"): DemoComplaint =>
    ({ street_id, category, created_at: minutesAgo(now, min).toISOString(), status });
  const last = streets.length - 1;
  return [
    c(pick(last), "no_water", 35),
    c(pick(last - 1), "no_water", 140),
    c(pick(2), "dirty_water", 260),
    c(pick(last - 2), "tanker_no_show", 410),
    c(pick(1), "other", 520),
    c(pick(0), "no_water", 600, "resolved"),
  ];
}

const recentTypes = (rows: DemoReport[], id: number, since: string) =>
  rows.filter((r) => r.street_id === id && r.created_at >= since).map((r) => r.type);

function summary(rows: DemoReport[], complaints: DemoComplaint[], streets: Street[], now: Date) {
  const on = rows.filter((r) => r.type === "water_on").length;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = rows.filter((r) => r.created_at >= midnight.toISOString()).length;
  console.log(`${rows.length} demo reports (${on} water_on, ${rows.length - on} water_off) over ${DAYS} days + today (${today} today), ${streets.length} streets.`);
  console.log(`${complaints.length} complaints (${complaints.filter((c) => c.status === "open").length} open).`);
  const since = minutesAgo(now, 180).toISOString();
  streets.forEach((s, i) => {
    const ons = rows.filter((r) => r.street_id === s.id && r.type === "water_on");
    const last = ons[ons.length - 1];
    const hours = last ? Math.round((now.getTime() - new Date(last.created_at).getTime()) / 3_600_000) : null;
    const prev = streets[i - 1], next = streets[i + 1];
    const st = computeStreetStatus(s.id, recentTypes(rows, s.id, since), prev ? recentTypes(rows, prev.id, since) : null, next ? recentTypes(rows, next.id, since) : null);
    const flag = st.suspect ? "  <-- SUSPECT (lone report, contradicts both neighbours)" : "";
    console.log(`  ${s.name.padEnd(24)} water_on x${String(ons.length).padStart(2)}, last ${hours === null ? "never" : hours + " h ago"}; now: ${(st.status ?? "no report").padEnd(9)} ${st.trust}${flag}`);
  });
}

async function main() {
  const now = new Date();
  if (process.argv.includes("--dry-run")) {
    const windows: Win[] = DAY_NAMES.map((day) => ({ area_id: 1, day, start_time: "03:00", end_time: "08:00" }));
    const rows = [...buildDemoReports(MOCK_STREETS, windows, now), ...buildRecentReports(MOCK_STREETS, now)];
    const complaints = buildDemoComplaints(MOCK_STREETS, now);
    summary(rows, complaints, MOCK_STREETS, now);
    // Self-check: the lone street must come out as suspect under op 15.
    const li = loneStreetIndex(MOCK_STREETS);
    const since = minutesAgo(now, 180).toISOString();
    const lone = MOCK_STREETS[li];
    const st = computeStreetStatus(lone.id, recentTypes(rows, lone.id, since), recentTypes(rows, MOCK_STREETS[li - 1].id, since), recentTypes(rows, MOCK_STREETS[li + 1].id, since));
    console.assert(st.suspect, "the lone street must be suspect");
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

  const wins = windows.map((w) => ({ ...w, start_time: w.start_time.slice(0, 5), end_time: w.end_time.slice(0, 5) }));
  const rows = [...buildDemoReports(streets, wins, now), ...buildRecentReports(streets, now)];
  const complaints = buildDemoComplaints(streets, now);

  // Re-seedable: wipe old demo rows only (real reports from the demo day are kept).
  const { error: de } = await db.from("reports").delete().eq("is_demo", true);
  if (de) throw de;
  const { error: ie } = await db.from("reports").insert(rows);
  if (ie) throw ie;

  // Complaints: reset the table (no is_demo flag in the contract), then insert the demo ones.
  const { error: cde } = await db.from("complaints").delete().gte("id", 0);
  if (cde) {
    console.warn(`complaints not seeded (${cde.message}). Has sql/v2.sql been run in Supabase?`);
  } else {
    const { error: cie } = await db.from("complaints").insert(complaints);
    if (cie) throw cie;
  }
  summary(rows, cde ? [] : complaints, streets, now);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

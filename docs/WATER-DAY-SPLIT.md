# Water-day split — Kot Delo? (round 3)

Planning only, 13 November 2026. Implementation briefs for P2 to P5; P1 merges. Builds on what is already on main (merge 6): resident tabs, locality first, guest flow, litres, all reservoirs, news and notices, V3 API, `components/ui/gauge.tsx`, ops 12 (reservoir tier) and 16 (likely water time).

## FIRST: pull main

Everyone, before you touch anything:

```
git checkout <your branch>
git pull origin main
git merge main        # fix conflicts in YOUR files only, then commit
npm install && npm run build
```

Main moved a lot (merges 5 and 6). Do not start on a stale branch.

## The new feature set

| # | Feature | Owner(s) |
|---|---------|----------|
| A | Water-day planner: timeline "03:00 water arrives, fill the tank, washing machine 06:00, laundry before 08:00" | P3 rule, P2 UI |
| B | Reminder before the window: "Water in 30 minutes. Start the pump." **Must work.** | P2 |
| C | Tomorrow forecast: next window from the official schedule, else the every-second-day rule, shifted by reservoir tier | P3 model, P2 UI, P4 ops |
| D | Reservoir diagram: tank/level drawing for every reservoir level | P2 component, P4 ops use |
| E | Water quality / health: low reservoir => "water may be cloudy" caution; boil advice only from an official notice | P3 rule, P5 sources, P2 UI |
| F | Save water + nearby help: skip the car wash, reuse water, nearest tanker stop / water point | P5 data, P2 UI, P4 map |
| G | Prediction model: reservoir trend (days until 30% / 20%) + next-window forecast with confidence | P3 model, P4 chart, P5 pitch |
| H | Diagrams everywhere a percentage or level is shown | P2 and P4 on their own screens |

## Rules that do not change

- Official notices only for quality or health alerts. **Never claim water is safe (or unsafe) to drink.** Feature E says "may be cloudy when levels are low" and "follow official advice"; "Boil before drinking" appears only when a dated official notice says so, with its source link.
- Every forecast is labelled **Estimate**, shows what it is based on, and never overrides an official CWA window.
- River idea (F): already dropped in DECISIONS #7 (we do not point people to untreated water), and washing cars or using detergent in rivers pollutes them. Do **not** send people to rivers unless P1 reopens #7 with an official source from P5. Default: nearest tanker stop / public water point + save-water tips.
- English only. No house pins, no person data. Fallback for every new card.

## P1 — contract V4 (do first, small)

Owns contracts/, TASKS.md, docs/.
1. Add ops 24 to 27 to `contracts/api.md` with the shapes below, so P2/P3/P4 build against one shape.
2. Confirm new file owners (table at the end). Merge order: P3 -> P2 -> P4 -> P5.

```ts
// op 24 GET /api/forecast?area_id=  (P3)
type Forecast = {
  next: { day: string; start_time: string; end_time: string };
  basis: "official" | "every_second_day" | "history";  // what it is based on
  confidence: "high" | "medium" | "low";               // official=high
  tier: "normal" | "watch" | "critical" | null;
  note: string;            // e.g. "Every second day since 10 Oct; reservoir at watch level"
  source_url: string | null;
};
// op 25 GET /api/reservoirs/trend?reservoir=  (P3)
type Trend = {
  reservoir: string; latest_pct: number; latest_day: string;
  pct_per_day: number;                 // negative = falling (least-squares slope)
  days_to_30: number | null; days_to_20: number | null; // null if rising or < 3 points
  points: { day: string; level_pct: number }[];
  projection: { day: string; level_pct: number }[];      // next 30 days, for the chart
};
// op 26 GET /api/quality?area_id=  (P3)
type Quality = {
  level: "none" | "cloudy_possible" | "official_notice";
  message: string;                       // fixed strings, no drinkability claim
  notice?: { title: string; day: string; source_url: string };
};
// op 27 planner: pure function, no API (P3 exports, P2 calls)
planDay(window: { start_time: string; end_time: string }, tasks?: string[]):
  { time: string; label: string; kind: "remind" | "arrive" | "task" | "end" }[];
```

## P2 — resident screens + diagrams (feat/home)

Own: `app/page.tsx`, `app/resident/`, `components/home/`, `components/ui/`, `app/globals.css`.

1. **Reservoir tank diagram** `components/ui/level-tank.tsx`: inline SVG tank, water fill = `level_pct`, wave line, tier colour, dashed marks at 30% and 20%, label "34.6% on 16 Oct". Reuse/extend `gauge.tsx` if it fits; no chart library. Use it on landing + resident Reservoirs tab. P4 imports it (do not change its props after you publish them).
2. **Water-day planner** (resident Overview, top card): vertical timeline from `planDay()` for today's window, e.g. 02:30 reminder, 03:00 water arrives, fill tank, 06:00 washing machine, 07:30 laundry done, 08:00 water ends. Highlight "now". Fallback: sample window, labelled.
3. **Reminders (must work)**: "Remind me 30 min before" button.
   - Primary: **Add to calendar** = download a `.ics` with a `VALARM` 30 min before. Works on every phone even with the browser closed. This is the demo-safe path.
   - Extra: `Notification.requestPermission()` + `setTimeout` for an in-app notification while the tab is open. No push server, no service worker.
   - Demo button "Test reminder now" fires the notification in 5 s.
4. **Tomorrow forecast card**: from op 24. Big time range, "Estimate" badge, basis + confidence chip, note. Official basis shows "Official CWA" with the link instead.
5. **Water quality card**: from op 26. Neutral info style for `cloudy_possible` ("When reservoirs are low, tap water can look cloudy. Report dirty water. Follow official CWA / Ministry of Health advice."), alert style + source only for `official_notice`. Link to the existing `dirty_water` complaint.
6. **Save water + nearby help card**: 3 tips (skip car wash, bucket not hose, reuse rinse water for plants/toilet) and "Nearest tanker stop / water point" from P5's data with distance. No river suggestion unless P5 confirms (see rules).
7. Diagram pass: anywhere landing/resident shows a % (reliability "4 of 7 days", reservoir, litres requested vs tank) use a bar, ring or tank, not a bare number.

Acceptance: 360 and 1440 px; .ics opens in phone calendar with the alarm; test reminder fires; every card has a labelled fallback; no text says water is safe/unsafe to drink.

## P3 — prediction model + rules (feat/data)

Own: `lib/queries.ts`, `app/api/`, `sql/`, `scripts/`.

1. **`forecastNext(areaId, now)`** (op 24), in order:
   - official: next `schedule` row on or after tomorrow -> `basis "official"`, `high`.
   - else every-second-day: last official window day + 2 days repeated until > today, same times -> `medium` (`low` when tier is critical: note "cuts may get longer").
   - else history: op 16 likely time -> `low`.
   - Pure function + async wrapper, like the existing ones.
2. **`reservoirTrend(points, now)`** (op 25): least-squares line over the reservoir's readings (min 3), project 30 days ahead, days until 30% and 20%. Same for every reservoir in `reservoir_levels`. Real check with the 7 Mare aux Vacoas rows now in `data/reservoir.csv` (38.5 on 25 Sep to 33.0 on 5 Nov): slope about -0.12 %/day, 20% reached around mid-February. The press said "20% by end of November", so the model is slower than the press: show our number as an estimate and link the press figure, do not hide the gap.
3. **`waterQuality(areaId)`** (op 26): `official_notice` if a current notice has category quality/boil (P5 data, P1 agreed shape); else `cloudy_possible` when tier is watch/critical; else `none`. Fixed message strings only.
4. **`planDay(window)`** (op 27): pure, no IO. Reminder = start - 30 min; tasks spread inside the window (fill tank at start, washing machine at start+3h if it fits, "finish laundry before" end - 30 min); handles windows crossing midnight.
5. Routes `app/api/forecast`, `app/api/reservoirs/trend`, `app/api/quality` with demo fallback.
6. One `console.assert` self-check per function in the `npx tsx lib/queries.ts` block: official beats rule; rule skips to the right day; falling series gives negative slope and a date; rising gives null; planner reminder = start - 30 min; window over midnight works.

Publish the shapes (copy them into `team/p3-backend/HANDOFF.md`) as soon as stubs return fixtures, so P2/P4 are not blocked.

## P4 — ops + map diagrams (feat/driver-map)

Own: `app/ops/`, `app/map/`, `app/driver/`, `components/map/`, `components/ops/`, `lib/eta.ts`.

1. **Ops Overview: reservoirs row** of `level-tank` diagrams (P2 component), one per reservoir, worst first.
2. **Prediction chart**: inline SVG line chart for op 25: solid line = readings, dashed = projection, horizontal lines at 30% and 20%, label "Mare aux Vacoas reaches 20% in ~N days (estimate)". No chart library.
3. **Forecast in ops**: per area the op 24 next window + basis, so dispatch can plan tankers for areas whose next window is far or low confidence.
4. **Map: water points layer** from P5's file (tanker stops / public water points), toggle like the other layers, nearest one highlighted for the resident view.
5. Diagram pass on your screens: dispatch litres vs tanker capacity as a fill bar, priority dry hours as a bar, driver round progress as a stop-progress bar.

Acceptance: chart and tanks render with fallback data when the API fails; map layer toggles; resize still works.

## P5 — data, safety sources, pitch (feat/data-files)

Own: `data/*.csv`, `README.md`, `team/p5-pitch/`.

1. **Reservoir history for all reservoirs** in `data/reservoir.csv` (at least 3 dated readings each, with source) so the trend model has input for more than Mare aux Vacoas.
2. **Every-second-day rule source**: the official CWA notice(s) stating the alternate-day schedule per area, dates in `data/schedule.csv`.
3. **Quality notices**: `data/quality_notices.csv` `area,day,title,category,source_url` (category `boil`/`quality`) from official CWA / Ministry of Health notices only. Empty file is fine; no invented rows.
4. **Water points**: `data/water_points.csv` `name,kind,lat,lng,source_url` (tanker stop, public standpipe, static tank). Only sourced points.
5. **River question** (only if the team wants to reopen DECISIONS #7): official source on using or washing cars in rivers in Mauritius. Otherwise skip.
6. **Refresh the feature/claims list** in README and pitch notes. The old "Do not claim yet" list is out of date: V2 (landing, ops, complaints, reservoir, likely water time) is on main since merges 5 and 6. Re-check the live site and list only what works there, keeping "demo data" labels where the database is still seeded.
7. **Pitch**: one slide on the prediction model (inputs: official schedule, alternate-day rule, reservoir trend, resident reports; output: next window + days to 20%), one on the water-day planner. Explain in 30 s why it is an estimate, not a promise.

## Surprise card (judged: "visibly built in, not bolted on")

The slot exists: `components/home/SurpriseCard.tsx` renders `null`, mounted first in the resident Overview (`components/home/Resident.tsx`). DECISIONS #9 is still empty.

- **P1:** write the revealed constraint word for word in DECISIONS #9, plus our one-line answer, and add it to SPEC.md. 15-minute huddle rule (PLAYBOOK §8): smallest change that visibly satisfies it.
- **P2:** fill `SurpriseCard.tsx`: a short title naming the constraint, 1 to 2 lines on how the app meets it, and a link or button into the feature that meets it (planner, reminder, forecast, tank). It must point to real working features, not just text. Fallback: hide the card if there is no content.
- **P3 / P4:** if the constraint needs data or a map/ops change, it goes on your list ahead of the round 3 items, same ownership rules.
- **P5:** fill the README "Surprise card" section (currently "TBD") and give it its own pitch moment in the live demo, not a closing slide.

If the constraint is unknown when you start, P2 builds the card shell with props `{ title, body, href }` and waits for P1's text.

## New files and owners

| File | Owner |
|---|---|
| components/ui/level-tank.tsx | P2 |
| components/home/Planner.tsx, Forecast.tsx, Quality.tsx, SaveWater.tsx (or inside Resident.tsx) | P2 |
| app/api/forecast, app/api/reservoirs/trend, app/api/quality | P3 |
| components/ops/TrendChart.tsx, components/map water-points layer | P4 |
| data/quality_notices.csv, data/water_points.csv | P5 (P3 loads them) |

## Demo path (for the pitch)

Resident picks Vacoas -> planner shows tonight 03:00 to 08:00 with tasks -> taps "Remind me" -> calendar alarm saved -> tomorrow forecast "Estimate, every second day" -> reservoir tank at 34.6% (watch) -> "water may be cloudy" caution -> ops shows the trend chart "20% in ~N days".

## Copy/paste messages

- **P2:** Pull main first (`git pull origin main && git merge main` on feat/home, build). Then read docs/WATER-DAY-SPLIT.md and do the P2 section in order: level-tank diagram, planner, reminders (.ics must work), forecast, quality, save-water cards, then the SurpriseCard. Use P3's shapes; mock them until the API lands. Never say water is safe or unsafe to drink. Commit small, update DONE/HANDOFF.
- **P3:** Pull main first (`git pull origin main && git merge main` on feat/data, build). Then read docs/WATER-DAY-SPLIT.md and do the P3 section: forecastNext, reservoirTrend, waterQuality, planDay + 3 routes, one self-check each. Publish stub shapes in your HANDOFF early. Commit small.
- **P4:** Pull main first (`git pull origin main && git merge main` on feat/driver-map, build). Then read docs/WATER-DAY-SPLIT.md and do the P4 section: reservoir tanks + SVG trend chart in ops, forecast per area, water-points map layer, diagram pass. Import P2's level-tank, do not edit it. Commit small.
- **P5:** Pull main first (`git pull origin main && git merge main` on feat/data-files). Then read docs/WATER-DAY-SPLIT.md and do the P5 section: reservoir history, alternate-day source, quality notices, water points, refresh the claims list, README surprise card section, two pitch slides. Sourced data only. Commit small.

# HANDOFF (p2-frontend) — V2 done, next split step 1 done

## Next split step 1 (docs/NEXT-TASK-SPLIT.md)
- **Changed:** new shared class `glass` in `app/globals.css`: translucent white + static 20px blur + white hairline. Falls back to opaque white when the browser has no backdrop-filter or the user turns on "reduce transparency". The nav uses it (phone tab bar and desktop top bar). Reduced motion: every transition/animation finishes at once.
- **For P4:** use `glass` for small floating panels over the map (legend, layer switch, bottom sheet); keep `surface` for text-heavy cards. Do not animate the blur.
- **How to test:** `npm run build`, `npm run dev`, scroll `/` and `/resident` at 390 and 1280px: the sky and cards show softly through the bars. Windows: Settings > Accessibility > Visual effects > Transparency effects off, or devtools "Emulate prefers-reduced-transparency": bars turn solid white.

## Changed
- **Shell + look (step 1).** `app/layout.tsx` renders the shared nav (`components/ui/app-nav.tsx`) on every screen: a floating rounded tab bar at the bottom on phones (Home, Resident, Map, Operations), a top bar from 1024px. `app/globals.css`: sky-blue gradient, bright blue `primary`, dark navy text, and three shared classes: `surface` (white card, 24px corners, soft shadow), `chip` (pill), `icon-btn` (round 48px). Buttons are pills; `size="tap"` is the big one. `components/ui/progress-ring.tsx` is the ring.
- **Landing `/` (step 2).** What Kot Delo? is, three ways in (Resident, Tanker driver, CWA operations), Mare aux Vacoas level as a ring with the supply tier (op 12, thresholds labelled "demo"), today's official window (op 1). Two columns from 1024px.
- **Resident `/resident` (steps 2 + 3).** The old Home in the new look, plus:
  - "Water on <street> now": what neighbours reported in the last 3 hours with a Confirmed / Unconfirmed chip (op 15), and "Water usually comes between 04:00 and 06:00" (op 16).
  - One report per street per 30 minutes: both buttons lock and a line says when you can report again. Remembered in localStorage on that phone only; nothing about the phone is sent.
  - "Something wrong?": two taps (Make a complaint, then a category) insert `{street_id, category}` into `complaints` (op 14). No free text.
  - "I need water" is unchanged: free, one tap. No payment anywhere.
- **Database wait (step 4).** 8 seconds. If the database does not answer, errors, or has no streets, the screen goes to demo mode with an amber banner and a "Try again" button that asks the database again.
- Shared loading code: `components/home/shared.tsx`. Rules as pure functions with a self-check: `components/home/rules.ts`.
- Screenshots: `team/p2-frontend/design/` (landing and resident at 390px and 1280px, real CSVs through a local stand-in database).

## Stand-ins until P3's functions are on main (swap = change the import, same shapes as the contract)
- Op 12 `getReservoirStatus()` in `components/home/shared.tsx`: a SAMPLE level (35.9%, hard-coded). The card says it is a sample. Needs `reservoir_levels` data.
- Ops 15 and 16 `streetStatus()` / `likelyWaterTime()` in `components/home/rules.ts`: my copies of the rules, running on REAL reports (not fake numbers).
- Op 14 `postComplaint()` in `components/home/shared.tsx`: a direct insert.
- One extra read `getRecentReports()` (a street's reports of the last 14 days) is also in `shared.tsx`.

## Needs from others
- P4: `app/map/page.tsx` uses `h-dvh`; use `h-[calc(100dvh-var(--nav-h))]` or the bottom panel hides behind the tab bar. Remove your own "Back / Home" links (the nav does it) and point any link to Home at `/resident`. `/ops` is in the nav and 404s until your page is merged. Use `surface`, `chip`, `ProgressRing` so /ops matches.
- P3: ops 12, 14, 15, 16 in `lib/queries.ts`, then tell me and I swap. Note for op 15: do not drop a report that is a few seconds "in the future" (the page clock ticks every 30 s).
- P1: run `sql/v2.sql` in Supabase. Until then a complaint on the real database answers "Your complaint was not sent".
- P5: `data/reservoir.csv`, so the ring shows a real level.

## Blocked
- Nothing in code. Not tested against the real Supabase (no keys on this laptop): the live "Served" flip and the complaint insert were only tested against a local stand-in.

## How to test
1. `npm run build` and `npm run lint` pass. `npx tsx components/home/rules.ts` prints `rules ok`, `npx tsx components/home/time.ts` prints `time ok`.
2. `npm run dev`. Check every screen at 390px and at 1280px: nothing scrolls sideways; phones show the floating tab bar, 1280px shows the top bar.
3. `/`: hero "Kot Delo?", three entries (Resident is the blue one), the reservoir ring with "Supply tier: Watch" and the "demo thresholds" note, today's window for Vacoas.
4. `/resident`: choose a street.
   - "Water on <street> now" shows No water / Water is running / No recent reports, the Confirmed or Unconfirmed chip, and the usual water time (or "Not enough reports yet").
   - Tap "No water": both buttons lock, the line says when you can report again, one row appears in `reports`. Reload: still locked. Choose another street: not locked.
   - Tap "I need water": blue "Tanker requested" card, one `waiting` row in `requests`, the card opens `/map?street=<id>`. Set the row to `served`: the green "Served" line appears without a reload.
   - Tap "Make a complaint", then "Dirty water": "Complaint sent: Dirty water." and one row in `complaints` (needs `sql/v2.sql`).
5. Turn the network off and reload `/resident`: after about 8 seconds the amber "Demo mode" banner shows with sample streets. Turn the network on, tap "Try again": the real streets come back.

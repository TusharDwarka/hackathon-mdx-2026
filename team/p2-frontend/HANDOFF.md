# HANDOFF (p2-frontend) — redesign: landing, sign-in, role shell, resident dashboard

## Redesign (latest)
- **Changed.** `/` is an app intro page: hero ("A small app that tells you when water comes") with a phone preview using REAL data (today's window, Mare aux Vacoas level), how it works, four features (window, tanker, one-tap reports, reservoirs), the latest 3 CWA notices, call to action, footer. Map and report pictures are illustrations (labelled for screen readers).
- **New `/login`.** Three roles: Resident = "Continue as guest" (`startGuestSession`), Tanker driver = tanker (`getTankers`) + access code, CWA staff = access code (`startStaffSession`). A wrong code/tanker stops with a message; if the server sign-in is not set up (no service key, v3.sql missing, offline) the demo still opens the screen. Demo codes shown: `demo-driver`, `demo-ops`. `?role=driver|ops` preselects. The chosen role is kept in `kotdelo.role` (screen choice only; P3's API guards writes).
- **Shell.** `components/ui/app-nav.tsx` = `AppShell` in the layout. `/` and `/login` are full width. Other screens: blue wave sidebar from 1024px, glass tab bar on phones, one nav per role (resident: Overview, Schedule, Report, Tanker, Notices, Reservoirs; driver: My round, Live map, Switch role; ops: Operations, Live map, Driver view). `--nav-h` is now 0 from 1024px (sidebar is beside the page); new `--side-w`. The old resident tab bar is gone: the shell is the nav.
- **Resident Overview** is a dashboard: "Your water today" (locality tabs, today's official window on the 24 h track, street, today's reports, usual time), reservoir dial (`components/ui/gauge.tsx`), water on my street now, blue tanker card, schedule vs reality, hours without water, CWA notices (4 latest, visible on Overview, no longer only under News).
- **Litres sent.** `postRequest(street.id, litres)` (P3's V3 signature).
- Shared bits in `components/ui/brand.tsx`: `Logo`, `LogoMark`, `PageHeader`, `SideWaves`, `BottomWaves`, role read/save. New utility `wave-panel` (deep-blue panel, white text).

## For P4 (please read)
- I restyled the markup of `app/driver/page.tsx` because the team asked for a distinct driver look: blue "Start a new round" card with stops/litres, round stats, location card, stop list with the next stop highlighted. NO logic changed (same state, effects, calls, texts). Please merge it with any driver work in progress, or tell me and I revert.
- `/ops` and `/map` are untouched; they sit in the new shell. `/map` keeps working: `h-[calc(100dvh-var(--nav-h))]` is full height from 1024px now. `/ops` could use `PageHeader` for the same top look.

## How to test (redesign)
1. `npm run build`, `npm run lint`, `npx tsx components/home/public-data.ts|rules.ts|time.ts`.
2. `/` at 390 and 1440: hero, phone preview with today's window and 33% dial, features, 3 notices, "Open the app" -> `/login`.
3. `/login`: Resident -> Continue as guest -> `/resident`. Tanker driver -> Use it (demo code) -> Sign in -> `/driver` with the driver sidebar. Wrong code -> "That access code is not right".
4. `/resident`: pick the locality chip -> dashboard. Sidebar/tab bar items open Schedule, Report, Notices, Reservoirs; Tanker opens `/map`. Report tab: 100 L -> Request -> "Tanker requested · 100 L".
5. Checked with a scripted Chrome at 360, 390 and 1440 px: no sideways scroll on /, /login, /resident (overview + report), /driver.


## Next split steps 2 to 7
- **Changed.** `/resident` is now five tabs: Overview, Schedule, Report, Reservoirs, News (real links `?tab=...`, so Back, reload and sharing work; the bar is sticky glass and scrolls sideways inside itself on small phones). Screen code moved to `components/home/Resident.tsx`; `app/resident/page.tsx` is a small server wrapper. Same for the landing: `components/home/Landing.tsx` + `app/page.tsx`.
- **Locality first (step 4).** "Where do you live?" with a search; the official window and the next 7 days show for the locality with NO street. Street is "optional" with the reason shown; asked only to report, call the tanker or see neighbours' reports. Locality, street and guest are remembered on the phone. A locality we do not have says so ("no CWA timetable for X yet, supported now: ...").
- **Official vs estimate.** Official windows carry an "Official CWA" tag and "the planned supply time, not a promise"; the likely time carries an "Estimate" tag and "not an official time and not a promise".
- **Guest flow (step 3).** Report tab: "Report as a guest" card with "Continue as guest" before any report/request/complaint. Reading never needs it. Landing: Resident is the main entry; Driver and CWA operations sit under "For staff" with a "Demo: open access" tag (`/#staff`).
- **Litres + trust wording (step 5).** Tanker request asks 20 / 50 / 100 / 200 L, then shows "Tanker requested · 100 L, Pending" and flips to Served live (unchanged Realtime). The button is replaced at once, so a double tap sends one request. One report shows "Reported: no water" + "A resident reported no water near this street", never a flat fact.
- **Reservoirs (step 6).** All seven, searchable, with % , "Measured on" vs "Published on", a "Stale: N days old" tag over 14 days, the note and the source link; a reservoir with no row shows "No verified reading". The all-seven aggregate is a separate line, not an 8th reservoir. Landing ring now uses the REAL latest Mare aux Vacoas figure (33% on 5 Nov 2026, sourced), the sample figure is gone.
- **News (step 6).** CWA cut notices + crisis timeline, newest first, searchable by place/topic, each with kind, date, areas and source; "not a live outage feed". "unrest" rows are left out (they name a private person). Advisory card: "No verified local advisory available. That does not mean the water is safe or unsafe."
- **Data.** `components/home/public-data.ts` reads P5's CSVs (`reservoir_levels.csv`, `reservoir.csv`, `water_cut_announcements.csv`, `crisis_timeline.csv`) at BUILD time (pages stay static). New CSV rows show after the next deploy.
- **Swapped to P3's code.** Ops 14, 15, 16 now use `postComplaint`, `computeStreetStatus`, `computeLikelyWaterTime` from `lib/queries.ts`; my copies are gone. Likely time now uses P3's fixed 2-hour slots.
- **Motion (step 7).** Tabs and new status lines fade in (opacity + 4px, 200 ms); none with reduced motion. No animated blur.

## Stand-ins (labelled `ponytail:` in code)
- Litres are NOT saved yet: shown on screen only. Needs P3: `requests.litres` + `postRequest(streetId, litres)`; then one line in `requestWater`.
- "Guest" is a yes/no on the phone (`kotdelo.guest`), nothing is sent. Needs P3's session API; swap in `saveGuest`.
- Staff screens are open in the demo (tagged on the landing). Needs P3/P1 sign-in for real driver/ops access.
- Area -> district for news: one entry (Vacoas -> Plaines-Wilhems) in `PublicInfo.tsx`. P3/P5 own the real mapping.

## For P4 (shared look)
- `glass` = small floating panels over the map (legend, layer switch, bottom sheet). `surface` = text cards. `chip` = pills/tags. Tags in use: `bg-primary/10 text-primary` "Official", `bg-muted` "Estimate", `bg-amber-100 text-amber-950` "Stale"/"Demo".
- Reusable from `components/home/PublicInfo.tsx`: `Source` (source link), `SearchBox`, `ReadingDate` (date + stale tag).

## Needs from others (new)
- P3: `requests.litres` + `postRequest(streetId, litres)`; guest session API; schedule rows by date stay ISO `YYYY-MM-DD` (the 7-day list reads them).
- P5: keep `data/*.csv` headers as they are (public-data.ts reads them by name); more reservoir readings fix the "Stale" tags.

## How to test (steps 2 to 7)
1. `npm run build`, `npm run lint`; `npx tsx components/home/public-data.ts` -> `public-data ok`; `npx tsx components/home/rules.ts` -> `rules ok`.
2. `/resident`: choose the locality chip -> today's window shows without a street. Type "Curepipe" -> honest "no timetable" line. Schedule tab -> 7 days + Estimate card.
3. Report tab -> "Continue as guest" -> choose a street -> No water (locks 30 min) -> 100 L -> Request -> "Tanker requested · 100 L". Complaint in two taps. Reload: locality, street, guest remembered.
4. Reservoirs: search "midl" -> one card. News: search "Moka"; advisory card says no verified advisory.
5. Widths 360, 390, 768, 1024, 1366x768, 1440: no sideways page scroll (checked with a scripted browser, all sections). Reduced motion and reduced transparency checked (transitions off, bars opaque).

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

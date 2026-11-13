# Next task split — Kot Delo?

Planning only, 13 November 2026. These are implementation briefs for separate teammates, not completed features. User request: split the work now; teammates implement and P1 merges later. Start without skills. If using Claude, select the user's requested Opus 5.5 if available; this document does not change anyone's model.

## What already exists

Reviewed source and project notes after pulling origin/main. Five routes exist: landing, resident, map, driver and operations. Reports, requests, complaints, timetable, reliability, likely water windows, live tanker tracking and a basic priority score are implemented, with demo fallbacks.

Concrete gaps in the current source:
- Requests have no litres; rounds have no tanker capacity or driver assignment. `components/map/data.ts` selects one active round globally.
- `app/map/page.tsx` uses `max-w-[390px]` and `h-dvh`; the driver also has a 390px width cap. `TruckMap.tsx` has no container-resize handling.
- Operations renders all sections together. Its top Resident/Map/Driver links work as navigation, but duplicate the shared nav; suggested dispatch actions are labels, not actions.
- Reservoir queries default to Mare aux Vacoas. Two CSVs have different schemas; the loader consumes `data/reservoir.csv`.
- Trust rules are duplicated in home/ops/backend code. Current agreement counts reports, not independent residents. The resident cooldown is localStorage only.
- Existing handoffs say real database loading and two-phone testing remain outstanding. That is documentary status, not a fresh inspection of the hosted database.

Use the actual root `app/`, `components/`, `lib/`, `sql/` layout from CLAUDE.md, not the older `/web` and `/api` ownership diagram. P1 must record any new ownership in the shared rules before implementation. Only P1 changes contracts. Each person does their listed steps sequentially, as small commits.

## Assignment overview

| Owner / branch | Work package | User items |
|---|---|---|
| P1 / integration docs branch | Scope, shared contract, ownership, final integration | Cross-cutting dependencies |
| P2 / feat/home | Responsive visual system, guest resident journey, search and separated public sections | 5, 6, 7 UI, 8, 13, 14 |
| P3 / feat/data | Capacity planning, report trust, session/role enforcement and shared data queries | 1 logic, 2, 3 data, 5 backend, 7 data, 12 |
| P4 / feat/driver-map | Responsive map, notice overlays, dispatch/driver workflow and grouped operations | 1 UI, 4, 9, 10, 11, 13 map, 15 |
| P5 / feat/data-files | Verified reservoirs/notices/advisories/supply data, acceptance QA and pitch | 3 sources, 7 sources, 11 sources, QA for all |

Item 16 is a working preference: no skills initially. Item 17 is a requested model preference, not a product feature. Rainfall/flooding, drought and chemical/fuel incidents are advisory contexts within item 3, not three duplicate features.

## P1 — contract and merge preparation

Own only shared planning/contracts/integration files and team/p1-dwarka/. Do this first; do not redesign screens.

1. Update SPEC and contracts for the requested next scope. Old V2 says no login and no drinkability claims. Define guest reporting and driver access explicitly; retain the rule that supply data cannot certify drinking-water safety.
2. Freeze shared types and operations with P3: request litres; tanker capacity; dispatch allocations and remaining demand; session roles; report confidence/review reasons; reservoir list; dated notices/advisories; complaint grouping; locality supply volume with period and units. Define null/unknown, provenance and demo states.
3. Resolve the guest-session identity change explicitly. Existing contract forbids person/device IDs. If allowing an opaque session identifier for abuse control, document its limited purpose, expiry and restricted access, with no house coordinates or public reporter identity. Do not quietly introduce a permanent person reputation score.
4. Keep P2 owner of `components/home/HeatMap.tsx` and shared CSS/UI. P4 owns new map layers under `components/map/`. P4 must request any changes to the existing home heat map from P2 instead of both editing it.
5. Agree any new file ownership before it is created. P3 owns new backend route handlers under `app/api/`, excluding any separately assigned AI folder. P2 can put public reservoir/news/advisory sections under existing landing/resident routes to avoid unnecessary new route ownership.

Done when the four builders have one contract, sample response shapes and explicit file boundaries. This is a prerequisite for cross-cutting backend changes, not a request to ask the user to approve the same scope again.

## P2 — resident experience and lightweight visual redesign

Own: `app/page.tsx`, `app/resident/`, `app/layout.tsx`, `app/globals.css`, `components/home/`, `components/ui/`, `team/p2-frontend/`.

Build in order:
1. Shared responsive shell and design tokens. Apple-inspired translucent navigation/small surfaces, clear typography, restrained blue accents and strong text contrast. Look at https://buckwheat.app for selective inspiration; do not clone the whole product. Reference text was accessible during planning; a visual audit remains for implementation.
2. Separate Overview, Water schedule, Report/request, Reservoirs and News/advisories into clear sections/tabs rather than one long dashboard. Search localities and reservoir names. Public information must work without login.
3. A clear "Continue as guest" flow for reporting/requesting, using P3's session API. Distinct Driver entry; no public role selector that grants real driver permissions. Mark demo role switching as demo if used.
4. Ask for locality first; show its official schedule immediately. Only ask for a street where the schedule differs or a tanker stop needs it. Remember the selection, explain why it is needed, and support unsupported localities honestly. Label official windows separately from historical estimates; neither is an exact delivery promise.
5. Add request volume in litres and show pending/served state through P3's APIs. Show a household report as "A resident reported no water near this street" or an equivalent aggregate label, not proof that the whole locality is dry.
6. Dedicated searchable reservoir view: every verified reservoir supplied by P5/P3, percentage, measurement date and source; unknown or stale values must remain visible as such. Add locality advisory/notice and supply-volume details only when data exists.
7. Short opacity/transform transitions; reduced-motion support; opaque fallback for glass. No animated blur, full-screen moving effects or expensive continuously animated backgrounds.

Acceptance:
- Check 360, 390, 768, 1024 and 1440px widths plus 1366x768; resizing Chrome does not clip controls or create page-level horizontal scroll.
- Guest can read news without a session and can report/request through the explicit guest flow; repeat click does not duplicate a request.
- Locality selection shows a useful schedule without compulsory street selection when data is area-level.
- Keyboard navigation, visible focus, readable contrast and touch-friendly controls work.
- Publish shared token/component usage to P4 before P4's visual polish. No edits to P4 screens.

## P3 — demand, access, trust and data services

Own: `sql/`, `scripts/`, `lib/queries.ts`, assigned `app/api/` handlers, `team/p3-backend/`. P1 owns contracts and Supabase client configuration. Do not implement screen design.

Build in order, after P1's contract update:
1. Session and write access: public read-only browsing, guest reports/requests, separate authorized driver/operations writes. Enforce permissions and throttling server-side/RLS, not just hidden buttons or localStorage. Preserve a clearly labelled demo flow.
2. Tanker planning: store positive request litres and usable tanker capacity. Sum outstanding demand; return loads needed, available vehicles, assigned stops/litres, unmet litres and refill need. Use litres consistently; 1 m3 = 1,000 L. Make dispatch allocation and serving idempotent and safe against two operators assigning the same demand.
3. Distinguish tank-loads from physical trucks. Six places x 20 L = 120 L; at 100 L capacity this needs two loads. It needs two tankers for a single departure without refill, or one tanker doing two trips if refill/time allow. Declare the assumption in the output. Do not claim that `ceil(total/capacity)` alone proves the fleet size for arbitrary time windows or indivisible stops.
4. For the demo use homogeneous capacities and a simple deterministic street-order allocation, with an explicit split-delivery policy. Demand over capacity must be split into tracked deliveries or returned as infeasible, never silently overfilled. Serving one stop must not mark unallocated or newly arrived requests served.
5. Report trust: preserve raw reports but return confidence and reason codes such as duplicate, burst or conflicting evidence. Predictions/neighbour reports are context, not proof of fraud. One report cannot confirm a locality outage. Use independent sessions only if P1 authorizes that contract change; never label a person "fake every time". Guest sessions cannot reliably establish a person's identity or defeat cleared-browser abuse; state that limitation.
6. Consolidate status/priority logic in shared queries so P2/P4 consume the same results. Return actionable demand and explanation, not only a score. Unknown dryness must not masquerade as zero hours dry.
7. Expose all-reservoir latest readings, locality notices with validity windows and provenance, advisories, and locality supply m3 with measurement period. Map source locality names to known areas; unmatched areas stay unmapped. Group complaints by category/locality/status with counts and IDs; keep individual records available to operations.

Acceptance / meaningful rule tests:
- 0 L -> 0 loads; 100 L -> 1 load; 120 L -> 2 loads; invalid/zero capacity rejected; insufficient fleet returns unmet demand/refill requirement.
- Duplicate dispatch/serve calls do not double-allocate or over-serve. Two drivers only mutate their assigned rounds.
- One report stays unconfirmed; repeated submissions do not manufacture independent corroboration; legitimate conflicting reports remain reviewable.
- Public users cannot invoke driver/ops mutations directly. Guest actions are limited on the server.
- Missing/stale sources return unknown/fallback with metadata. No prediction or reservoir percentage becomes a drinking-safety verdict.
- Migration instructions are explicit; do not run destructive seeds against live complaints. Existing seed-demo resets complaints.

## P4 — map, operations and multiple drivers

Own: `app/map/`, `app/driver/`, `app/ops/`, `components/map/`, `components/ops/`, `lib/eta.ts`, `team/p4-ai/`. Consume P2 tokens and P3 APIs; do not edit their files.

Build in order:
1. Fix desktop/tablet map and driver layouts: remove the 390px page cap, account for `--nav-h`, give the map a real container height, and call Leaflet `invalidateSize()` on container resize. Use a desktop side panel and mobile bottom panel that do not cover essential map controls. Clean up resize listeners/observers.
2. Add separately labelled map layers: recent resident reports, historical supply reliability, official planned interruptions and live tankers. Use a quiet basemap and a blue scale for supply likelihood/reliability: darker blue = higher likelihood of water, pale blue = lower, grey = unknown. Show period, sample count and legend; do not present historical frequency as a calibrated forecast.
3. Official notices must show affected locality, start/end, source and expiry. Use a distinct outline/hatching/icon for an interruption so dark blue never ambiguously means both water and outage. Do not infer street-level precision from a broad locality notice or draw invented boundaries; use sourced boundaries or labelled area markers.
4. A single household report is an unconfirmed street-level signal. No home pin or reporter identity. Neighbouring streets are supporting context, not automatic proof of agreement or fraud.
5. Split operations into Overview, Dispatch, Complaints and Report review. Replace duplicate top navigation with useful section controls; every control must work or be visibly unavailable with a reason.
6. Make priority useful: show waiting demand in litres, dry-duration evidence/confidence, reason for ranking and an "Add to dispatch" action. Dispatch preview shows tankers/loads, capacity, stops, assigned litres and unmet demand. Confirming uses P3's allocation API; do not bypass it with ad hoc table writes.
7. Driver view shows only the assigned vehicle/round and litres per stop. Support multiple rounds, rather than resuming the latest global round. Resident map follows the tanker assigned to their request/street. Preserve start, GPS, served and end flow with stale-GPS fallback.
8. Complaint filters/groups by category, locality and status; counts, expandable records and resolution. Restore state/show a retry when resolve fails rather than making a complaint disappear permanently.

Acceptance:
- Map survives window resize, minimize/restore and panel changes without blank tiles; attribution remains visible.
- Switch layers and inspect one real sourced notice; expired notices leave the active layer and unmatched places are not plotted incorrectly.
- A resident report never creates a house pin or marks an entire locality definitively dry.
- 120 L / 100 L example is visible in dispatch, including the two-load/refill distinction.
- Two drivers have different assigned work; serving one allocation does not serve the other's requests.
- Reuse map instances and update layers/markers; no map recreation or network request per animation frame. Respect reduced motion, clean up realtime subscriptions and stop GPS on round end.

## P5 — source data and acceptance QA

Own: `data/*.csv`, `README.md`, `team/p5-pitch/`. Put source notes in README or team notes; request shared documentation changes through P1.

Build in order:
1. Inventory existing data. `reservoir.csv` is consumed by the loader; `reservoir_levels.csv` has a different format, including historical comparison dates and an ALL_7_RESERVOIRS aggregate. Consolidate through P1/P3's agreed schema. Do not treat the aggregate as an individual reservoir or prior-year values as current.
2. Find the latest available official readings for all listed Mauritian reservoirs. Preserve source URL, actual measurement date, retrieval date and missing/stale status. No invented percentage to fill a card.
3. Verify official CWA interruption notices, affected localities and effective start/end times. Existing announcement CSV contains old historical notices; do not relabel them as today's outages. Supply area-name mappings; no invented polygon geometry.
4. Research official locality water-quality advisories and supply volumes in m3 with their time period. An island-wide total is not a locality allocation; stored reservoir volume is not treated water delivered. If locality data is unavailable, record that finding and deliver an unknown state.
5. For rainfall/flooding, cyclone aftermath, drought/low levels and chemical/fuel incidents, supply dated official advisory text/links and affected areas when available. Weather or low storage alone cannot establish whether tap water is drinkable. The UI should say "No verified local advisory available" where appropriate; absence of an advisory does not certify safety. Do not generate generic boiling advice for chemical incidents. Verify any health guidance against authoritative sources during implementation.
6. Run the shared QA matrix below and update the pitch to show only working, sourced features. Record screenshots/issues in your folder; the relevant owner fixes them.

Acceptance:
- Every surfaced figure/notice has provenance, date, units and geographic scope; stale/current/demo data are distinguishable.
- Reservoir list covers the verified inventory and explicitly shows missing readings.
- Reproduce and report each UX failure with route, viewport, steps and expected result. No implementation edits outside your ownership.

## Shared merge order and demo test

1. P1 merges scope/contract changes. P2 can build the shell and P5 can research while these are prepared; P4 can fix map sizing independently.
2. P3 publishes query/type shapes and migrations first. P2/P4 use local labelled fixtures matching those shapes until the API lands; no competing shared schemas.
3. Merge P2's shared shell/tokens before P4's final visual polish. Merge P5 data and P3 loaders together once their format agrees.
4. Merge P3 services, then connected P2 resident views and P4 dispatch/map/driver views. P1 applies documented migrations and data loads deliberately.
5. Each builder runs build/lint and relevant rule checks, updates their own DONE/HANDOFF with changed/needs/blocked/how to test, and commits. P1 runs the combined demo before merging final integration to main. Never force-push or stage unrelated files.

Shared acceptance run: guest reads news -> selects locality -> sees official window -> submits an unconfirmed report -> requests litres -> operations groups demand and previews capacity -> assigns two drivers -> resident sees the right moving tanker -> one allocation is served -> remaining demand stays pending. Also inspect all-reservoir list, a sourced notice overlay, grouped complaints, missing-data fallback and stale GPS. Run on phone plus laptop, including resize and reduced motion. Profile map pan/zoom and navigation on the target laptop; record observed performance rather than promising "no lag" without testing.

Protect the existing live-truck wow moment. If time runs short, finish working dispatch + responsive UI + reliable sources before optional animations or a broader prediction system. Respect feature freeze; unfinished extras must not break the demo.

## Copy/paste handoff starters

Send each person their own line, with this document available on the shared branch:

- **P2:** Read CLAUDE.md, SPEC.md, contracts/api.md, your TODO and docs/NEXT-TASK-SPLIT.md. Implement the P2 package one step at a time on feat/home. Own only your listed files. Start without skills. Coordinate shared tokens with P4; use P3's contract. Verify responsive guest/resident flows, then commit and update your DONE/HANDOFF.
- **P3:** Read the same project context plus your TODO and docs/NEXT-TASK-SPLIT.md. Implement the P3 package on feat/data after P1 freezes the updated contract. Start with session/role and demand schemas, publish interfaces early, then capacity/trust/data services. Test allocation, access and idempotency. Stay in your ownership, commit and update DONE/HANDOFF.
- **P4:** Read the same project context plus your TODO and docs/NEXT-TASK-SPLIT.md. Implement the P4 package on feat/driver-map. Start with map resizing; use P2 tokens and P3 APIs for dispatch and driver assignments. No shared CSS/home heat-map edits. Verify multi-driver live tracking and all map layers, commit and update DONE/HANDOFF.
- **P5:** Read the same project context plus your TODO and docs/NEXT-TASK-SPLIT.md. Implement the P5 package on feat/data-files. Verify source dates/areas/units, consolidate reservoir data with P3, gather official notices/advisories, then execute shared QA. No fabricated data or safety claims. Commit data/QA notes and update DONE/HANDOFF.

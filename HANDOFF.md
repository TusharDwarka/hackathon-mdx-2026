# HANDOFF (project-level) — append after every build step

Format per step: **Step N — done / changed / blocked** + 5 beginner bullets. Per-person handoffs live in `team/*/HANDOFF.md`.

## Step 0 — planning
- Done: SPEC.md, contracts/api.md, TASKS.md, README.md, docs/DECISIONS.md, docs/PLAYBOOK.md, docs/BUILD-PROMPT.md, data/README.md.
- Changed: CLAUDE.md / AGENTS.md now point to docs/BUILD-PROMPT.md and docs/PLAYBOOK.md.
- Blocked: `data/schedule.csv` and `data/streets.csv` do not exist yet; [LOCALITY] not chosen.

## Step 1 — scaffold (code part)
- Done: Next.js 16 + TypeScript + Tailwind + shadcn (button, card, select, badge), `lib/supabase.ts` (browser/anon), `lib/supabase-server.ts` (service key, server only), `sql/schema.sql` (8 tables, RLS, Realtime), `scripts/load-data.ts` (`npm run load-data`, stops if the CSVs are missing), placeholder Home page. `npm run build` passes.
- Changed: ownership in CLAUDE.md / AGENTS.md now uses real folders and branches (feat/home, feat/data, feat/driver-map, feat/data-files). Removed the old web/ and api/ folder rules.
- Blocked / by hand (P1): Supabase project + run `sql/schema.sql` + keys in `.env.local` and Vercel; Vercel deploy; the CSVs from P5.
- 5 beginner bullets:
  1. Next.js is the web framework: every folder under `app/` with a `page.tsx` becomes a URL (`app/driver/page.tsx` -> `/driver`).
  2. Tailwind is utility CSS written in `className`; shadcn gives ready-made accessible components in `components/ui/`.
  3. Supabase is the hosted Postgres database; `lib/supabase.ts` is how the browser talks to it with the public anon key.
  4. `sql/schema.sql` creates the 8 tables and the rules (RLS) that say what the anon key may read or write.
  5. `scripts/load-data.ts` reads the real CSVs and fills the database; the service key it uses must never reach the browser.

## Step 5 — /driver wired to Supabase (P4)
- Done: Start round (ops 4), position every 5 s + Wake Lock (op 5), Served (op 6), End round (op 7). `components/map/data.ts` shared reads. Demo fallbacks: no requests -> all streets; no GPS -> simulated drive; no DB -> demo mode banner.
- Changed: `app/driver/page.tsx`, `components/map/data.ts`, `team/p4-ai/*`.
- Blocked: real-phone GPS test needs the Vercel https URL; Home must insert `requests` for the stop list to be real. Details in `team/p4-ai/HANDOFF.md`.
- 5 beginner bullets:
  1. `navigator.geolocation.watchPosition` asks the phone for its GPS position and calls us every time it changes; we keep only the latest fix.
  2. A `setInterval` every 5 s inserts that latest fix into `truck_positions` with the round id. Only while a round is active, so nobody is tracked outside a round.
  3. The Wake Lock API (`navigator.wakeLock.request("screen")`) keeps the phone screen on so the browser keeps sending GPS; we re-ask for it when the tab comes back to the front.
  4. Start round = one row in `rounds` + one row per street in `round_stops`, in `streets.order_index` order, built from the streets that have `waiting` requests.
  5. Served writes `served_at` on the stop and flips that street's requests to `served`; End round writes `status = done` and the React effect cleanup stops GPS and releases the lock.

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

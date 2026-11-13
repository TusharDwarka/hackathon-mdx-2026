# Kot Delo? — Hackathon MDX 2026 (theme: Live Better)

> Status: planning done (Step 0), build not started. TBD items are filled as we decide.

## Problem
During CWA water rationing, households in [LOCALITY], Mauritius (locality TBD) don't know when water will really come or when the tanker truck will arrive.

## User
One household in [LOCALITY].

## What it does
Shows today's official CWA water window for your street, lets neighbours report "Water is here" / "No water", lets a household request the tanker ("I need water"), and shows the tanker truck moving live with "N stops away, about X min". It then compares the official schedule with what actually happened: reliability score and a heat map of hours without water. English labels.

## Data sources
- Official CWA water timetable: `/data/schedule.csv` (source_url + source_date kept in the file) — TBD, REAL data
- Streets and coordinates: `/data/streets.csv` — TBD, REAL data
- **Demo data:** 7 days of seeded reports, flagged `is_demo = true` in the database, so the schedule-vs-reality card and heat map have history. They are NOT real neighbour reports.

## Stack
Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + Realtime) · Leaflet + OpenStreetMap · Vercel. Mobile-first (390px). The tanker is tracked by the driver's phone (`/driver`, geolocation + Wake Lock), not hardware.

## AI tools used
- Claude Code (Anthropic) — planning, code generation, review
- Codex CLI (OpenAI) — code review, bug hunting
- Skills/plugins: Ponytail, Karpathy guidelines
- AI features inside the app: none in the core (rule-based ETA and reliability score)

## Surprise card
TBD (revealed during the event). The Home screen has an empty `<SurpriseCard />` slot for it.

## Privacy
Reports and requests are stored by street, never by house or person. Only the truck is tracked, and only while a round is active.

## How to run
TBD after build step 1 (`.env.local` with Supabase keys, `npm install`, `npm run dev`).

## Team
See `team/` for per-person notes, `docs/DECISIONS.md` for decisions and times, `docs/PLAYBOOK.md` for how we work.

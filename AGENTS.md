# Hackathon MDX 2026 — shared rules (read by every Claude and by Codex; same content as CLAUDE.md)

24h hackathon, "Life Powered by Tech", Mauritius. Team of 5, fully vibe-coded. Goal: a working mobile-first app that solves a real Mauritian problem, uses AI in a non-obvious way, has ONE wow moment, pitched in 10 minutes.
**Product: "Kot Delo?"** (Live Better: CWA water rationing + live tanker tracking). Read **docs/BUILD-PROMPT.md** (wins on product), SPEC.md, contracts/api.md, TASKS.md. Real rules/times: docs/CHALLENGE.md. How the team works: docs/PLAYBOOK.md.
Stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres + Realtime) · Leaflet + OpenStreetMap · Vercel. Secrets in .env.local, service key server-side only.

## Golden rules
- Build only what the demo needs. Judges see the demo: polish the visible 20%, fake or skip the invisible 80%.
- Demo path first, infrastructure second. No admin panels, settings pages or real auth unless SPEC.md says so.
- Every demo-path screen needs a fallback (mock data, cached AI response) so it never breaks live.
- Vibe-coded but understood: every person can explain their part in 30 seconds.

## How to code (Ponytail + Karpathy)
- Think before coding: state assumptions out loud; ask when confused.
- Simplicity first: the minimum code that works. No unrequested abstractions.
- Surgical changes: touch only what the task needs.
- Goal-driven: finish one task, run it, verify it.

## Ownership — edit ONLY your own folder
| Person | Role | Owns |
|---|---|---|
| P1 Dwarka | lead / integrator | main, package.json, next.config.ts, lib/supabase*.ts, CLAUDE.md, AGENTS.md, SPEC.md, TASKS.md, TRACKER.md, docs/, contracts/ |
| P2 | landing + resident + design | app/page.tsx, app/resident/, app/layout.tsx, app/globals.css, components/home/, components/ui/, team/p2-frontend/ (branch feat/home) |
| P3 | data + queries | sql/, scripts/, lib/queries.ts, app/api/, team/p3-backend/ (branch feat/data) |
| P4 | driver + map + ops | app/driver/, app/map/, app/ops/, components/map/, components/ops/, lib/eta.ts, team/p4-ai/ (branch feat/driver-map) |
| P5 | data files + pitch | data/*.csv, README.md, team/p5-pitch/ (branch feat/data-files) |
- Open a pull request into `main` from your branch; P1 merges.
- `contracts/` is frozen: only P1 edits it. Need a change? Ask P1 (2 minutes saves 2 hours).
- Need something from another folder? Write it in your HANDOFF.md under "Needs from others".

## Session starter (every new task)
Read CLAUDE.md, SPEC.md, contracts/api.md and team/<my-folder>/TODO.md. Do ONE task only. When done: run it, append a line to team/<my-folder>/DONE.md, update HANDOFF.md (changed / needs / blocked / how to test), commit.

## Git
- `main` is protected: only P1 merges. Work on feat/web, feat/api or feat/ai. Commit small, push at least hourly.
- Before a new task: `git pull origin main` then `git merge main` into your branch.
- Commit style: `web: add result screen`, `api: POST /reports`, `ai: cache fallback`.
- NEVER add Co-Authored-By or any Claude/Codex attribution to commits or PRs.
- No `rm -rf`, `git push --force`, `git reset --hard`.

## Secrets
- `.env` is git-ignored. API keys are used server-side only, never in browser code. Share keys over WhatsApp DM, not in the repo.

## Timeline
Real schedule: core working end to end by Fri 15:30 · solid by Fri 22:00 · FEATURE FREEZE Sat 08:00 (bug fixes only) · submit by Sat 12:30. See docs/CHALLENGE.md.
Rules: real dataset required, public repo, list AI tools in README, never identify or profile individuals.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

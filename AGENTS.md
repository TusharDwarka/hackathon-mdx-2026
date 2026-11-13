# Hackathon MDX 2026 — shared rules (read by every Claude and by Codex; same content as CLAUDE.md)

24h hackathon, "Life Powered by Tech", Mauritius. Team of 5, fully vibe-coded. Goal: a working mobile-first app that solves a real Mauritian problem, uses AI in a non-obvious way, has ONE wow moment, pitched in 10 minutes.
Stack: Next.js + Tailwind + shadcn · Supabase · Vercel · LLM API called server-side only.

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
| P1 Dwarka | lead / integrator | main, CLAUDE.md, AGENTS.md, SPEC.md, TASKS.md, TRACKER.md, docs/, contracts/ |
| P2 | front end | /web, team/p2-frontend/ |
| P3 | back end / data | /api (not /api/ai), team/p3-backend/ |
| P4 | AI + research | /api/ai, team/p4-ai/ |
| P5 | pitch / QA | team/p5-pitch/ |
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
FEATURE FREEZE at H19: bug fixes only after that.

# Team Playbook (Markdown version of Hackathon-Playbook-MDX-2026.pdf)

> Precedence: **docs/BUILD-PROMPT.md wins on the product. docs/CHALLENGE.md wins on real rules and times** (the playbook was written before kickoff and uses H0 = start; real start = Fri 12:30, freeze Sat 08:00, submit Sat 12:30, max 6 slides).

## 1. Goal and golden rules
Goal: win with a working, mobile-first app that solves a real Mauritian problem, has one "wow" moment, and is pitched clearly by a team that can explain every part.

1. Two hours max on the idea.
2. Demo first, infrastructure second. Demo path end to end, ugly, by H8.
3. One wow moment. Design the whole demo around it.
4. Polish the visible 20%, skip the invisible 80%. No admin panels, settings or real auth unless the demo needs it.
5. Run the demo in about 3 minutes of the 10.
6. Have a fallback: mock data, cached response, backup video.
7. Vibe-coded but understood: everyone explains their part in 30 seconds.
8. Use the strategist at 3 moments: ideation, midpoint scope check, pitch prep.

STOP: if any tool/skill takes more than 15 minutes to set up, drop it.

## 2. Team, roles, model budget
| Person | Role | Owns |
|---|---|---|
| P1 Dwarka | lead / integrator / reviewer | repo, main, CLAUDE.md, SPEC, contracts, TASKS, merges, deploys, tech slide |
| P2 | front end / UI | /web screens and polish |
| P3 | back end / data | /api, Supabase schema, seed data, deploy config |
| P4 | AI feature + research | /api/ai, prompts, Mauritian data |
| P5 | pitch / story / QA | slides, script, backup video, phone testing, Q&A prep |

Model + effort: start with the smallest model and lowest effort that does the job, step up only if the answer is weak.
- Fable 5.2 high/max: hard decisions (idea scoring, SPEC/contracts, scope check, pitch, judge drill).
- Opus 5.5 high: main build workhorse. xhigh/max: stuck 30+ min.
- Sonnet medium: routine tasks (one screen, one endpoint, small UI). Haiku low: tiny edits, copy, commit messages.
- Codex high (P1): review every branch before merge, smoke tests, second attempt at risky pieces.
Limit savers: /clear between tasks, one task per session, short CLAUDE.md, no huge logs, ask for "the minimal change", swap tasks if someone hits their limit.

## 3. Phases (playbook H-times; map to real times in CHALLENGE.md)
| Phase | What |
|---|---|
| Kickoff | Challenge, rules, judging into docs/CHALLENGE.md. Ask organisers: AI APIs allowed? from scratch? sponsor tech? projector or phone? |
| Diverge / converge | Strategist ideas, score top 3 on innovation, technical depth, Mauritian impact, demoable in 3 min, buildable. Decide fast. One-line pitch. |
| Spec + mockup + spike | P1: SPEC, contracts, TASKS. P2: clickable mockup. P3: scaffold + Supabase + Vercel hello world. P4: prove the wow works. P5: slide skeleton. |
| Checkpoint 1 | Mockup + scaffold on main and live. Everyone pulls. |
| Build sprint 1 | Branches in parallel: feat/web, feat/api, feat/ai. P1 merges every ~90 min with a Codex review. |
| Checkpoint 2 (midpoint) | Demo path works end to end on the live URL. Scope check: cut or fake anything not done by H17. |
| Build sprint 2 | Real data replaces mocks, finish the wow moment, second feature only if the first is solid. |
| Sleep shifts | Shift A: P2, P5. Shift B: P1, P4. P3 separately. P1 and P3 never asleep at the same time. |
| Polish | Audit + polish visible screens, 2-3 meaningful animations, loading/empty states, real Mauritian content, phone testing, architecture diagram. Don't redesign. |
| FEATURE FREEZE | Bug fixes only after this (real: Sat 08:00). |
| Ship | Final deploy, test on Android + iPhone + mobile data, seeded demo account, QR code, backup video. |
| Pitch prep + rehearse x3 | Timed full runs, one run with a deliberate failure (switch to backup video), Q&A drill. |

## 4. Repo ownership and files
- Root rules: CLAUDE.md (Claude) / AGENTS.md (Codex), P1 only. SPEC.md, TASKS.md, TRACKER.md, contracts/: P1 only.
- team/<person>/: TODO.md (tasks), DONE.md (one line per finished task + commit hash), HANDOFF.md (changed / needs / blocked / how to test). P1 reads all handoffs at each merge.
- Nobody edits another person's folder. Contract changes go through P1.
- Personal uncommitted notes: CLAUDE.local.md (git-ignored).

## 5. Git and guardrails
- main: only P1 merges. Work on feat/* branches, commit small, push at least hourly. Before a task: `git pull origin main`, `git merge main`.
- Commit style: `web: add result screen`, `api: POST /reports`, `ai: cache fallback`.
- No Co-Authored-By / Claude attribution: `.claude/settings.json` (attribution off), CLAUDE.md rule, `.githooks/commit-msg` (run `git config core.hooksPath .githooks` after cloning).
- No secrets in git (.env git-ignored, keys server-side only, share via WhatsApp DM).
- Denied commands: `rm -rf`, `git push --force`, `git reset --hard`.
- Review before merge: Codex reviews every branch; P1 reads HANDOFF files.

## 6. Skills (use only these)
P1: strategist, Matt Pocock (grill-with-docs, to-prd, to-issues, prototype, diagnosing-bugs), ECC agents (planner, code-reviewer, build-error-resolver), Karpathy, Ponytail, Understand Anything, Archify, Orca + Codex.
P2: Matt Pocock prototype, Karpathy, Ponytail, Impeccable (main design skill), Emil (polish only; Taste skill backup only, never with Impeccable).
P3: Karpathy, Ponytail, build-error-resolver agent. P4: Karpathy, Ponytail, last30days, strategist. P5: Diagram Design (optional), free chat AI.
Skip: Addy Osmani agent-skills, Agent Reach, career-ops, mods, full ECC plugin.

## 7. Prompts
See docs/PROMPTS.md.

## 8. Surprise-challenge playbook
| Surprise | Response |
|---|---|
| Narrower theme | Map our angle onto it; deadline doesn't move. |
| Mid-event twist ("must work offline", "serve elderly users") | 15-min huddle: smallest change that visibly satisfies it. P1 updates SPEC + TASKS. Usually one screen or one flag. |
| Required sponsor tech/API | P4 spikes it 30 min; on the demo path if it works, else one visible place + mention in pitch. |
| AI APIs not allowed / rate-limited | Cached responses + deterministic rules. |
| Wi-Fi dies | Phone hotspot, cached fallback, backup video, downloaded datasets. |
| Teammate hits AI limit | Swap tasks. |
| Deploy breaks at 3 AM | build-error-resolver or Codex; roll back to last good Vercel deploy, then fix. |
| Demo on judges' phones | QR code + seeded account; test Android, iPhone, slow data. |

## 9. Pitch (10 min) and rehearsal
| Time | Section | Who |
|---|---|---|
| 0:00 | Hook: a real Mauritian story or number | P5 |
| 1:00 | Problem: who suffers, how many, what they do today | P5 |
| 2:00 | Live demo ending on the wow moment (one drives, one narrates) | P2 + P1 |
| 6:00 | How it works (architecture diagram) | P1 |
| 7:00 | Impact and business: who adopts/pays, how it scales | P4/P5 |
| 8:30 | Roadmap + team | P3 |
| 9:30 | Close + QR "Try it now" | P5 |
Rehearsal: run 1 timed; run 2 with a deliberate failure (switch to backup video); Q&A drill; run 3 final, then stop changing anything.
Demo safety: seeded logged-in state, phone full brightness + Do Not Disturb, hotspot ready, backup video on desktop, pre-filled inputs.

## 10. Judge Q&A bank (prepare an answer for each)
1. Stack and why? (P1) 2. Where is AI used, why not rules? (P4) 3. Which model/API, cost at scale? (P4) 4. What if the AI is wrong? (P4) 5. Where is data stored, is it secure, Data Protection Act? (P3) 6. How does it scale island-wide? (P3) 7. What did you fake? (P1, be honest) 8. Users, did you validate the problem? (P5) 9. Who pays? (P5) 10. What exists already, how are you different? (P5) 11. Kreol / French / offline? (P2/P4) 12. How much did AI write, how did you check it? (P1: "AI wrote the code; we designed the spec and contracts, reviewed every merge, and can walk you through any file.") 13. Next 3 months? (P3) 14. Accessibility for elderly users? (P2) 15. Hardest technical problem? (P1)

## 11. Learning loop (P1)
After every merge: "Teach me" prompt, answers into team/p1-dwarka/NOTES.md. Mid-event and pre-pitch: /understand. Trace one request phone -> database -> back out loud. Each teammate explains their part in 30 seconds before the pitch.

## 12. Tracker
See TRACKER.md.

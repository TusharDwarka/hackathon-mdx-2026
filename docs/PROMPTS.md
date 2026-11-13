# Prompt library (copy and paste). Model/effort in brackets.

## Ideation (H0:20) [Fable high/max]
Use the hackathon-ai-strategist agent. 24h hackathon at Middlesex University Mauritius, theme "Life Powered by Tech". Challenge: [paste docs/CHALLENGE.md]. Team of 5: lead/integrator, frontend, backend, AI dev, pitch person. All vibe-coding. Output: mobile-first web app, 10-minute live pitch. Give 5 ideas solving a REAL Mauritian problem, using AI in a non-obvious way (not a chatbot), each with: one-line pitch, the single "wow" demo moment, what to fake, data source, and a score per judging criterion. Rank by chance of winning. Be brutal about feasibility.

## Grill the winner (H1:00) [Fable]
/grill-with-docs Our idea: [one-line pitch]. Challenge: docs/CHALLENGE.md. Grill it like a hackathon judge AND like a senior engineer with 16 build hours. One question at a time. End with: biggest risk, what to cut, the 3-minute demo path.

## SPEC + contracts + TASKS (H1:30) [Fable max]
/to-prd Write SPEC.md for: [pitch]. Include: user, problem, demo story step by step, 5-7 screens (name + purpose + data shown), the wow moment, "FAKED / NOT BUILT" list. Under 1 page. Then write contracts/api.md: every endpoint the demo needs (method, path, request JSON, response JSON) + one mock JSON per endpoint in contracts/mocks/. Minimum endpoints only.
/to-issues Split SPEC into tasks in TASKS.md grouped by owner: P2 web/, P3 api/, P4 api/ai/. Each task: id, title, done-check, files. Order by demo path first.

## Mockup (P2, H1:30) [Opus high]
/prototype Read SPEC.md and contracts/mocks/. Build a clickable mobile-first prototype in /web (Next.js + Tailwind + shadcn) for every screen, wired to the mock JSON, so the demo story can be clicked end to end on a phone. Use the impeccable skill for design. It becomes the real front end: clean components, no throwaway code. Only edit /web.

## Session starter (everyone, every new task) [Sonnet medium, or Opus high for multi-file]
You are [P2 frontend | P3 backend | P4 AI] on a 5-person hackathon team. Read CLAUDE.md, SPEC.md, contracts/api.md and team/[my-folder]/TODO.md. Do task [ID] only. Edit only [web/ | api/ | api/ai/] and team/[my-folder]/. Minimal change that makes the work work; state assumptions first. When done: run it, append to team/[my-folder]/DONE.md and HANDOFF.md, then commit with message "[area]: [what]" - no attribution lines.

## Codex review before merge (P1) [Codex high]
Review the diff of branch feat/[x] against main. Check against SPEC.md and contracts/api.md. List ONLY: real bugs, contract mismatches, secrets in code, things that break the demo path. No style nitpicks. Give exact file:line and a minimal fix for each.

## Teach me (P1, after every merge) [Sonnet]
Explain what changed in the last merge for a beginner who knows C/C++/Python but not web dev. 5 bullets max. Then: the 3 questions a judge could ask about it, with short answers. Append the answers to team/p1-dwarka/NOTES.md.

## Midpoint scope check (H8) [Fable high]
Use the hackathon-ai-strategist agent. We are at hour 8 of 24. SPEC.md is the plan; TASKS.md and team/*/DONE.md show progress. Live URL: [url]. Tell us: what to cut, what to fake, what must be finished for the demo by H17, and whether the wow moment is strong enough. Be ruthless.

## Stuck bug (30+ min) [Opus xhigh/max]
/diagnosing-bugs Bug: [what happens vs expected]. Steps: [..]. Error: [first 20 lines only]. Find the root cause before changing anything. Then the smallest fix.

## Pitch prep (H21) [Fable high]
Use the hackathon-ai-strategist agent. Demo in ~3h. We built: [summary + SPEC.md]. Write a 10-minute pitch script with a strong Mauritian opening hook, hitting every judging criterion. Mark exactly what to show live vs on slides. Then list the 12 hardest judge questions with crisp answers.

## Judge grilling drill [Fable]
Act as a tough hackathon judge (technical + business). Ask me one question at a time about our app (SPEC.md + architecture). After each answer, score it /10 and give a better answer.

## Pitch structure (10 min)
0:00 Hook (P5) · 1:00 Problem (P5) · 2:00 Live demo (P2+P1) · 6:00 How it works / Archify diagram (P1) · 7:00 Impact + business (P4/P5) · 8:30 Roadmap + team (P3) · 9:30 Close + QR (P5)
Demo safety: seeded logged-in account, phone full brightness + Do Not Disturb, hotspot ready, backup video on laptop desktop, pre-fill all inputs.

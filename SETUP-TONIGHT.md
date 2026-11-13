# SETUP TONIGHT (Part B) — nothing here should happen during the 24 hours
Rule: if any command fails, read the repo README for 10 min max, then SKIP it.
A Claude subscription is NOT an API key: P4 needs an API key with credit or a free tier for the in-app AI.

## Who installs what
| Item | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|
| Git + GitHub (logged in, can push) | x | x | x | x | x |
| Node.js LTS | x | x | x | x | |
| Claude Code (Fable 5.2 + Opus 5.5, effort levels) | x | x | x | x | |
| Codex CLI | x | | | | |
| Orca desktop app (onorca.dev) | x | | | | |
| Karpathy skills + Ponytail | x | x | x | x | |
| Matt Pocock skills (5 selected) | x | x | | | |
| Understand Anything + Archify | x | | | | |
| Impeccable + Emil (+ Taste backup) | | x | | | |
| last30days | | | | x | |
| Diagram Design (optional) | | | | | opt |
| Vercel + Supabase (GitHub login) | x | | x | | |
| LLM API key for the in-app AI | | | | x | |
| Slides tool + screen recorder | | | | | x |

## Core tools (terminal)
```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
claude    # log in, then /model -> check Fable 5.2 + Opus 5.5 and effort levels
codex     # log in (P1)
```
Orca (P1): download from onorca.dev -> import ~/.claude and ~/.codex settings -> Add Repo -> check Claude + Codex detected.

## Everyone with Claude (P1-P4) — inside Claude Code
```
/plugin marketplace add forrestchang/andrej-karpathy-skills
/plugin install andrej-karpathy-skills@karpathy-skills
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```
P1 also for Codex: `codex plugin marketplace add DietrichGebert/ponytail`

## P1 (and P2 for Matt Pocock)
```bash
# Hackathon strategist agent (run inside the repo folder)
npx claude-code-templates@latest --agent ai-specialists/hackathon-ai-strategist

# Matt Pocock skills - select ONLY: setup-matt-pocock-skills, grill-with-docs, to-prd, to-issues, diagnosing-bugs
npx skills@latest add mattpocock/skills
# then inside Claude Code in the repo:  /setup-matt-pocock-skills   (choose LOCAL FILES as tracker)

# ECC - cherry-pick 3 agents only (planner, code-reviewer, build-error-resolver) into .claude/agents/
git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git ecc-tmp
cp ecc-tmp/agents/planner.md ecc-tmp/agents/code-reviewer.md ecc-tmp/agents/build-error-resolver.md .claude/agents/
# then delete the ecc-tmp folder yourself (permissions.deny blocks rm -rf inside Claude)
# (if file names differ: ls ecc-tmp/agents and pick the closest three)

# Understand Anything (inside Claude Code)
/plugin marketplace add Lum1104/Understand-Anything
/plugin install understand-anything

# Archify
npx skills add tt-a1i/archify -g
```

## P2 (front end)
```bash
npx skills add pbakaus/impeccable          # then in Claude Code in the repo: /impeccable init (at mockup time)
npx skills add emilkowalski/skills --skill emil-design-eng
npx skills add Leonxlnx/taste-skill --skill design-taste-frontend   # BACKUP ONLY, never with Impeccable
```

## P4 (AI + research) — inside Claude Code
```
/plugin marketplace add mvanhorn/last30days-skill
/plugin install last30days
/last30days traffic problems Mauritius      # if it asks for API keys -> skip, use normal web search
```

## P5 (optional) — inside Claude Code
```
/plugin marketplace add cathrynlavery/diagram-design
/plugin install diagram-design@diagram-design
```

## Repo setup (P1, tonight)
```bash
gh repo create hackathon-mdx-2026 --private --clone && cd hackathon-mdx-2026
# copy this whole kit folder's contents here (incl. dotfiles), then:
git config core.hooksPath .githooks && chmod +x .githooks/commit-msg
git add . && git commit -m "chore: starter kit" && git push -u origin main
# GitHub -> Settings -> Collaborators: add P2-P5
# GitHub -> Settings -> Branches: protect main (require PR / restrict pushes)
```
Each teammate after cloning: `git config core.hooksPath .githooks`

## Free accounts
Vercel Hobby (yes) · Supabase free (yes) · LLM API free tier/credits (yes, P4) · GitHub Student Pack education.github.com/pack (nice to have, apply tonight) · free domain (optional).

## Verification test (15 min per person)
- [ ] `git --version`, clone the team repo, make a test branch, push it
- [ ] `claude` opens in the repo; `/model` shows Fable 5.2 + Opus 5.5, effort low -> max; `/plugin list` shows Karpathy + Ponytail
- [ ] Ask Claude: "Read CLAUDE.md and tell me the 3 most important rules" -> answers from the file
- [ ] Dummy commit with Claude; `git log -1` shows NO Co-Authored-By / Claude-Session line
- [ ] P1: Orca shows Claude and Codex in separate worktrees; Codex can review a test diff
- [ ] P2: `/impeccable` responds. P4: `/last30days` runs (or marked skipped)
- [ ] P4: one successful LLM API call from a tiny script
- [ ] P3: Vercel hello world deploys from the repo
- [ ] Download datasets to a shared drive: data.govmu.org, Statistics Mauritius, relevant Kaggle sets
- [ ] Pack your bag. Charge everything. Sleep.

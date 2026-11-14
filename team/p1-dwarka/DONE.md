# DONE (p1-dwarka)

One line per finished task: what, files, commit hash.

- 2026-11-14: Merged origin/main and latest origin/fix/mobile-layout (4f0ffe7) into release, merge 03e639d. Production build passed; source lint passed with two existing warnings when generated .vercel output was excluded.

- 2026-11-13: Reviewed current source and split the requested improvements into P1–P5 implementation briefs, ownership boundaries, merge order and acceptance checks in docs/NEXT-TASK-SPLIT.md; linked from TASKS.md. Planning only; no app changes. Commit: docs: split next improvements by owner.

- Merge 1: PR #1 feat/data, #2 feat/home, #3 feat/driver-map into main; build, lint and self-checks pass on the merged code; TASKS.md + HANDOFF.md updated, `npm run seed-demo` added — 9ed0071
- Merge 2: PR #5 feat/data-files into main (real schedule + streets, CSVs checked against the loader and the CWA notice); decision #8 logged, TASKS.md + HANDOFF.md updated — 772f4e6
- Merge 3: PR #7 feat/home into main (Home on real queries, heat map, day track, design pass); build, lint and time self-check pass; TASKS.md steps 2, 7, 8 ticked, HANDOFF.md updated — a75ec2f

- Merge 5: feat/data, feat/driver-map, feat/home into main; build fix (tsconfig excludes scripts/test-sql.ts); build, lint and all 6 self-checks pass; contract V3 adopted, TASKS 18 to 21 added
- Sat 14 Nov: staff assign streets to a tanker (driver only sees its own round), truck snapped to the road, no sideways scroll on phones, mobile Dispatch, tanker test data reset; P4 pitch deck merged into release. Details in HANDOFF.md

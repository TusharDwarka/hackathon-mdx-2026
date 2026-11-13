-- Kot Delo? V3 lockdown. Run ONLY after sql/v3.sql AND after the Resident (P2), Driver/Map/Ops (P4)
-- screens write through /api/* instead of the anon key. Before that, running this breaks them.
--
-- Effect: the browser (anon key) can still READ everything public, but can no longer INSERT or
-- UPDATE reports, requests, complaints, rounds, round_stops or truck_positions directly.
-- Every write then goes through a route handler that checks the session role and limits.
-- Undo (if the demo needs it): re-run the "insert"/"update" policies from schema.sql and v2.sql.

drop policy if exists "insert" on reports;
drop policy if exists "insert" on requests;
drop policy if exists "update" on requests;
drop policy if exists "insert" on complaints;
drop policy if exists "update" on complaints;
drop policy if exists "insert" on rounds;
drop policy if exists "update" on rounds;
drop policy if exists "insert" on round_stops;
drop policy if exists "update" on round_stops;
drop policy if exists "insert" on truck_positions;

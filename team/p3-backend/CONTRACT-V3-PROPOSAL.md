# Contract V3 proposal (P3 -> P1)

P1 owns `contracts/api.md`. This is what P3 built on `feat/data` for docs/NEXT-TASK-SPLIT.md, written so P1 can copy it into the contract (or change it, and P3 follows). Nothing here edits the frozen contract.

## Decisions P1 must confirm
1. **Guest session (identity change).** An opaque random token in an httpOnly cookie. Only its SHA-256 is stored. It expires after 24 h for a guest and 12 h for driver or ops. It is readable by the service role only (no anon policy, privileges revoked). Its only purposes are throttling and counting independent reports. It is not a person ID, there is no reputation score, and no house or reporter identity is ever returned. Limitation: clearing cookies gives a new session.
2. **Staff access.** Driver and ops sessions need an access code from server env vars `DRIVER_ACCESS_CODE` and `OPS_ACCESS_CODE`. Without them, the demo codes `demo-driver` and `demo-ops` work only outside production, or when `KD_DEMO_ACCESS=1` is set. The session then says `demo_access: true`, and the UI must label it.
3. **Request litres.** A whole number from 1 to 1000 (demo cap). Old rows have null litres and are not planned (they are counted as `requests_without_litres`).
4. **Round = one tank-load of one tanker.** New status `planned`. A tanker has at most one open round. A second load for the same tanker is a refill trip, made after the first ends.
5. **Split delivery is on by default.** A request bigger than the space left on a load is split, and each part is tracked in `allocations`. With `split=false`, a request bigger than one tank is reported as infeasible. A load is never overfilled.
6. **Demo limits.**

| Action | Limit |
|---|---|
| Report | 1 per session per street per 30 min; 10 per session per hour |
| Request | 1 waiting per session per street (a repeat returns the same id); 3 open per session |
| Complaint | 1 per session per street per category per 6 h (a repeat returns the same id); 5 per hour |
| New guest sessions | 60 per minute for the whole site |

## Schema (`sql/v3.sql`, additive; `sql/v3-lockdown.sql` later)

| Table | Change |
|---|---|
| tankers (new) | id, name, capacity_litres > 0, active. Two "Demo tanker" rows of 1000 L |
| sessions (new, private) | id uuid, token_hash, role guest/driver/ops, tanker_id (drivers only), created_at, expires_at |
| session_actions (new, private) | session_id, kind report/request/complaint, street_id, ref_id, created_at |
| requests | + litres (> 0; null = pre-V3) |
| rounds | + tanker_id, + dispatch_key (unique), status + 'planned' |
| allocations (new) | round_id, round_stop_id, request_id, litres > 0, delivered_at, released_at; unique (round_id, request_id) |
| complaints | + is_demo |
| reservoir_levels | + date_basis (data_date / article_date / reported), + is_aggregate |
| notices (new) | kind interruption/rationing/advisory, topic, locality (as in source), area_id (null = unmapped), starts_at, ends_at, title, source_url, source_date |
| supply_volumes (new) | locality, area_id, volume_m3, period_start, period_end, source_url |

After the lockdown, anon may read only. Every write goes through `/api/*` with the service key and a `kd_*` function that re-checks ownership and limits in one transaction.

## Operations (V3)

| # | Route | Who | Effect |
|---|---|---|---|
| 18 | `GET/POST/DELETE /api/session` | anyone | current session / start guest, or driver `{code, tanker_id}`, or ops `{code}` / end |
| 2' | `POST /api/reports {street_id, type}` | session | op 2 with limits |
| 3' | `POST /api/requests {street_id, litres}` | session | op 3 with litres; repeat = same id |
| 19 | `GET /api/requests` | session | my requests with `allocated_litres`, `delivered_litres` |
| 14' | `GET /api/complaints?status=open\|all` | anyone; ops also gets `records` | groups by category + area + status with counts and ids |
| 14' | `POST /api/complaints`, `PATCH /api/complaints {id, status}` | session / ops | file / resolve or reopen |
| 20 | `GET /api/dispatch?capacity&tankers&max_trips&split` | ops | plan from outstanding demand (see shape) |
| 21 | `POST /api/dispatch {tanker_id, dispatch_key, split}` | ops | one load on that tanker; same key = same round |
| 4' to 7' | `POST /api/rounds {action}` | driver: start, serve, end, position. Ops: cancel | own tanker's round only; serve marks only that stop's allocated litres |
| 22 | `GET /api/rounds[?street_id]` | driver: own round. Others: open rounds | stops with litres; resident follows the tanker for their street |
| 15' | `GET /api/status` | anyone | trust per street with `confidence`, `reasons`, `independent_sources`, `needs_review` |
| 17' | `GET /api/priority` | anyone | adds `waiting_litres`, `dry_known`, `reasons` |
| 12' | `GET /api/reservoirs` | anyone | every reservoir: `current` / `stale` (over 14 days) / `missing`; aggregate apart |
| 23 | `GET /api/notices?area_id` | anyone | active / upcoming / expired_count, `advisory_message`, supply, unmapped localities |

Errors are `{error: code}` with a status:

| Status | Codes |
|---|---|
| 400 | invalid_*, unknown_street, unknown_tanker |
| 401 | session_required |
| 403 | forbidden, bad_access_code, not_your_round |
| 404 | unknown_stop, unknown_round, unknown_complaint |
| 409 | tanker_busy, no_outstanding_demand, round_not_active, no_tankers |
| 429 | throttled (with `retry_after_s`), too_many_open_requests |
| 503 | backend_not_configured, migration_missing, staff_access_not_configured |

## Sample shapes

`GET /api/dispatch?capacity=100&tankers=1`, with six waiting requests of 20 L:
```json
{
  "plan": {
    "capacity_litres": 100, "split": true, "total_litres": 120,
    "loads_needed": 2, "min_loads": 2, "tankers_available": 1, "max_trips_per_tanker": 1,
    "tankers_for_one_departure": 2, "refill_trips_needed": 1,
    "assigned_litres": 100, "unmet_litres": 20, "feasible": false,
    "loads": [
      { "load_no": 1, "tanker_no": 1, "trip_no": 1, "litres": 100,
        "stops": [{ "street_id": 1, "litres": 20, "requests": [{ "request_id": 11, "litres": 20 }] }] },
      { "load_no": 2, "tanker_no": null, "trip_no": null, "litres": 20, "stops": [] }
    ],
    "infeasible": [],
    "assumptions": ["Every tanker carries 100 L ...", "Split delivery: ...", "At most 1 trip per tanker; ..."]
  },
  "tankers": [{ "id": 1, "name": "Demo tanker 1", "capacity_litres": 1000, "active": true, "busy": false }],
  "requests_without_litres": 0
}
```

`GET /api/status`, one street:
```json
{ "street_id": 4, "status": "water_off", "trust": "unconfirmed", "suspect": false, "reports": 3,
  "independent_sources": 1, "confidence": "low", "reasons": ["single_source", "duplicate_source"], "needs_review": false }
```

`GET /api/rounds` as a driver:
```json
{ "role": "driver", "rounds": [{ "id": 7, "status": "active", "started_at": "...",
  "tanker": { "id": 1, "name": "Demo tanker 1", "capacity_litres": 1000 }, "litres": 400,
  "stops": [{ "id": 31, "street_id": 2, "street_name": "Armeria 2 Lane", "stop_order": 1, "served_at": null, "litres": 200 }] }] }
```

`GET /api/reservoirs`, one entry each:
```json
{ "reservoirs": [
    { "reservoir": "Mare aux Vacoas", "day": "2026-11-05", "level_pct": 33, "tier": "watch", "age_days": 8, "state": "current", "date_basis": "reported", "source_url": "...", "is_aggregate": false },
    { "reservoir": "Midlands Dam", "state": "missing" } ],
  "aggregate": { "reservoir": "All 7 reservoirs", "state": "stale", "...": "..." },
  "thresholds": "DEMO thresholds: ... never says whether tap water is safe to drink." }
```

## Data files P5 can add (optional; the loader skips them when missing)
- `data/notices.csv`: `kind,topic,areas,starts_at,ends_at,title,source_url,source_date`. `areas` is separated by `;`. Times are ISO. A row without kind, title, source_url or source_date is skipped, never completed.
- `data/supply.csv`: `locality,volume_m3,period_start,period_end,source_url`.
- `data/reservoir_levels.csv` is now loaded too. Rows marked `prior_year_comparison` are skipped. `ALL_7_RESERVOIRS` is stored as the aggregate.

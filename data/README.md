# data/ — REAL data only (never invented)

Build step 1 loads these two files. If `schedule.csv` is missing, the build stops.

## schedule.csv — official CWA water timetable for [LOCALITY]
Columns (header row required):
```
area,day,start_time,end_time,source_url,source_date
```
- `area`: area name exactly as in streets.csv
- `day`: Mon..Sun, or a date `YYYY-MM-DD` if the timetable is per date
- `start_time`, `end_time`: `HH:MM` (24h)
- `source_url`: link to the CWA communiqué / timetable
- `source_date`: date the timetable was published, `YYYY-MM-DD`

## streets.csv — streets in [LOCALITY] the tanker serves
```
area,name,lat,lng,order_index
```
- `lat`, `lng`: decimal degrees (from OpenStreetMap / Google Maps)
- `order_index`: the order the truck drives through them (1, 2, 3 ...)

Note the source of every file in the README "Data sources" section.

## supply_rules.csv: supply rule per locality (V5)
```
locality,district,region,frequency,start_time,end_time,valid_from,source_url,source_date,basis
```
- One row per slot: a locality with a morning and an afternoon slot has two rows.
- `frequency`: `every_2_days` (counted from `valid_from`) or `daily`. Blank when `basis=unknown`.
- `basis`: `locality_notice` > `regional_timetable` > `unknown`. With `unknown`, times stay blank: show "Not known yet".
- Same name in two districts (e.g. Robinson in Curepipe and in Pamplemousses): match on `locality` + `district`. Blank `district` = the notice doesn't say.
- Rebuild: `python team/p5-pitch/build_supply_rules.py public/places.json`

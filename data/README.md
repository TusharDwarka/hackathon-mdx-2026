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

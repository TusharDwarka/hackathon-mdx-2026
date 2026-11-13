# Builds data/supply_rules.csv (contract V5). Run from the repo root:
#   python team/p5-pitch/build_supply_rules.py <places.json>
# <places.json> = P3's public/places.json (OSM localities with district).
# Rules, newest and most specific first:
#   1. CWA communique 10 Oct 2026 (53 named localities)          -> basis locality_notice
#   2. CWA timetable 5 Aug 2026, by district -> North/East/South/Port-Louis -> basis regional_timetable
#   3. Plaines Wilhems, Moka, Black River (17 Jun restrictions, no published hours) -> basis unknown
import csv, json, re, sys, unicodedata

OCT = "data/context/cwa-supply-localities-oct-2026.csv"
OUT = "data/supply_rules.csv"
AUG_URL = "https://cwa.govmu.org/cwa/wp-content/uploads/2026/08/HORAIRES-5-1.pdf"

# District -> region of the 5 Aug timetable. Our mapping: the CWA names regions, not districts.
REGION = {
    "Port Louis": "Port-Louis",
    "Pamplemousses": "North", "Rivière du Rempart": "North",
    "Flacq": "East",
    "Grand Port": "South", "Savanne": "South",
}
SLOTS = {  # 5 Aug 2026 timetable, two slots a day
    "North": [("04:00", "07:00"), ("16:00", "19:00")],
    "East": [("04:00", "07:00"), ("16:00", "19:00")],
    "South": [("05:00", "08:00"), ("17:00", "19:00")],
    "Port-Louis": [("04:00", "08:00"), ("16:00", "20:00")],
}
RESTRICTED = {"Plaines Wilhems", "Moka", "Black River"}

# Communique name -> OSM locality name, only where the communique clearly means that place.
ALIAS = {
    "Saint-Pierre Centre": "Saint Pierre", "Curepipe Centre": "Curepipe",
    "Lower Dagotière": "Dagotière", "Upper Dagotière": "Dagotière",
    "Quartier-Militaire Media": "Quartier Militaire", "Quartier-Militaire Royal Road": "Quartier Militaire",
    "Quartier-Militaire terminus area": "Quartier Militaire",
    "Malinga": "Malenga", "L'Espérance": "Espérance",
    "Alma Village": "Alma", "Alma H. Est": "Alma",
    "Beau Bois H.E et Ripailles": "Ripailles", "Vuillemin H.E et NHDC": "Vuillemin",
    "Cité Mangalkhan": "Mangalkhan",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s.replace("’", "'")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


places = json.load(open(sys.argv[1], encoding="utf-8"))
osm = [p for p in places if p["n"] == p["l"]]
# OSM localities that can match a communique name: Mare-aux-Vacoas towns are in Plaines Wilhems / Moka only
upper = {norm(p["n"]): p for p in osm if p["d"] in ("Plaines Wilhems", "Moka")}

rows, covered = [], set()
for o in csv.DictReader(open(OCT, encoding="utf-8")):
    p = upper.get(norm(ALIAS.get(o["locality"], o["locality"])))
    group_b = o["supply_group"] == "B"  # Curepipe article: all in Plaines Wilhems
    district = p["d"] if p else ("Plaines Wilhems" if group_b else "")
    rows.append([o["locality"], district, f"Mare-aux-Vacoas group {o['supply_group']}", o["frequency"],
                 o["start_time"], o["end_time"], o["first_supply_date"], o["source_url"], o["source_date"], "locality_notice"])
    if p:
        covered.add((p["n"], p["d"]))
        if p["n"] != o["locality"]:  # also under the OSM name, so the places index finds it
            rows.append([p["n"]] + rows[-1][1:])

# Vacoas-Phoenix (the town) = Vacoas + Phoenix, both group A, same rule
vp = upper.get(norm("Vacoas-Phoenix"))
if vp:
    a = next(r for r in rows if r[0] == "Vacoas")
    rows.append(["Vacoas-Phoenix", vp["d"]] + a[2:])
    covered.add((vp["n"], vp["d"]))

seen = set()
for p in sorted(osm, key=lambda p: (p["d"], p["n"])):
    key = (p["n"], p["d"])
    if key in covered or key in seen:
        continue
    seen.add(key)
    region = REGION.get(p["d"])
    if region:
        for start, end in SLOTS[region]:
            rows.append([p["n"], p["d"], region, "daily", start, end, "2026-08-05", AUG_URL, "2026-08-05", "regional_timetable"])
    elif p["d"] in RESTRICTED:
        rows.append([p["n"], p["d"], "Plaines Wilhems / Moka / Black River (17 Jun restrictions)", "", "", "", "",
                     AUG_URL, "2026-08-05", "unknown"])
    else:
        rows.append([p["n"], p["d"], "", "", "", "", "", "", "", "unknown"])

# dedupe exact repeats (several communique names map to one OSM name)
out, dup = [], set()
for r in rows:
    if tuple(r[:6]) not in dup:
        dup.add(tuple(r[:6]))
        out.append(r)

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["locality", "district", "region", "frequency", "start_time", "end_time", "valid_from", "source_url", "source_date", "basis"])
    w.writerows(out)
print(f"{len(out)} rows, {len({(r[0], r[1]) for r in out})} localities -> {OUT}")

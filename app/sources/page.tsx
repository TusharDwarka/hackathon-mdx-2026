// Where every number in Kot Delo? comes from, and how it was collected. Static page.
import { PageHeader } from "@/components/ui/brand";

export const metadata = { title: "Data sources · Kot Delo?" };

type Row = { what: string; source: string; how: string; url?: string };
const ROWS: Row[] = [
  { what: "Water timetables (CWA)", source: "cwa.govmu.org news posts and communiqué PDFs", how: "Scraped with the WordPress REST API (scripts/scrape-notices.ts). Times typed from the PDFs, which are images.", url: "https://cwa.govmu.org/cwa/?cat=2" },
  { what: "Supply hours for 347 localities", source: "CWA communiqués of 10 Oct and 5 Aug 2026, Defimedia articles quoting them", how: "Matched to every locality, with a basis label: locality notice, regional timetable or unknown." },
  { what: "Notices feed", source: "CWA website, GIS (gis.govmu.org), Defimedia and Le Mauricien RSS", how: "Scraped from RSS and the CWA API. Claude reads the places, dates and times; staff check before publishing. Facebook is never scraped." },
  { what: "Reservoir levels", source: "Water Resources Commission figures, as published by L'Express, Defimedia, ION News and Le Mauricien", how: "Collected by hand from articles that state the date. Each reading links to its article. Latest: 12 Nov 2026.", url: "https://www.lemauricien.com/actualites/societe/secheresse-mare-aux-vacoas-a-33-la-baisse-du-niveau-vue-du-ciel/723192/" },
  { what: "Streets, localities, rivers", source: "© OpenStreetMap contributors (ODbL)", how: "Downloaded with the Overpass API (scripts/fetch-osm.ts).", url: "https://www.openstreetmap.org/copyright" },
  { what: "Water points (30,000 L tanks)", source: "Le Mauricien, 22 Oct 2026", how: "Placed at the centre of each locality named. The article gives no exact spot." },
  { what: "Hours of supply (June 2026)", source: "water.cyber.mu, republishing CWA data", how: "Scraped from its tables. Replaced by newer CWA notices where they exist.", url: "https://water.cyber.mu/hours-of-supply/mav-upper-vacoas/" },
  { what: "Is my tap water safe?", source: "CWA Water Quality page, Ministry of Health, WHO", how: "Quoted word for word. No 2026 boil-water notice was found.", url: "https://cwa.govmu.org/cwa/?page_id=813" },
  { what: "CWA branches, water balance", source: "data.govmu.org (national open data portal)", how: "Downloaded as CSV.", url: "https://data.govmu.org" },
  { what: "Reports, tanker requests, complaints", source: "Residents using Kot Delo?", how: "Stored by street only. Seeded demo reports are flagged as demo." },
];

export default function Sources() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-10 md:max-w-3xl lg:px-8 lg:pt-8">
      <PageHeader eyebrow="Real data only" title="Data sources" />
      <p className="mt-3 text-sm text-muted-foreground">Collected 13–14 Nov 2026. Raw files are in the data/ folder of the public repo.</p>
      <ul className="mt-6 flex flex-col gap-3">
        {ROWS.map((r) => (
          <li key={r.what} className="surface flex flex-col gap-1 p-5">
            <h2 className="font-semibold">{r.what}</h2>
            <p className="text-sm">{r.url ? <a className="text-primary underline underline-offset-2" href={r.url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}</p>
            <p className="text-sm text-muted-foreground">{r.how}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

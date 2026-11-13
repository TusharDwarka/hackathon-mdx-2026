// "Is my tap water safe to drink?": the full guide under the live card (Resident ?tab=drink).
// Every line comes from an official source listed in SOURCES (CWA, Government Notice 55 of 1996, Ministry of
// Health, WHO), read on 14 Nov 2026. Where no source says anything (tanker water), the row says so.
import { Check, ExternalLink, FlaskConical, Phone, ShieldCheck, Sparkles, X } from "lucide-react";

const card = "surface reveal p-5";
const title = "text-lg leading-snug font-bold tracking-[-0.01em]";
const tag = "chip min-h-6 shrink-0 px-2 text-xs font-semibold";

const SOURCES = {
  cwaQuality: { name: "CWA, Water Quality page (updated 5 Mar 2026)", url: "https://cwa.govmu.org/cwa/?page_id=813" },
  cwaTreatment: { name: "CWA, Water Treatment page (2026)", url: "https://cwa.govmu.org/cwa/?page_id=750" },
  cwaTesting: { name: "CWA Laboratory, Water testing and reporting (Apr 2026)", url: "https://cwa.govmu.org/cwa/wp-content/uploads/2026/04/Water-testing-and-reporting.pdf" },
  cwaTankGuide: { name: "CWA, Guide for cleaning household tanks (Apr 2026)", url: "https://cwa.govmu.org/cwa/wp-content/uploads/2026/04/Guide-for-cleaning-household-tanks.pdf" },
  cwaPoster: { name: "CWA poster, Cleaning and disinfection of domestic tanks (Jul 2022)", url: "https://cwa.govmu.org/cwa/wp-content/uploads/2022/07/cleaning-of-tank-1.pdf" },
  standards: { name: "Drinking Water Standards Regulations 1996 (GN No. 55 of 1996)", url: "https://cwa.govmu.org/cwa/wp-content/uploads/2026/03/Drinking-water-standards-GN-No.-55-of-1996.pdf" },
  health: { name: "Ministry of Health, health advice after heavy rain", url: "https://govmu.org/FR/infoservices/healthandmedicalservices/Pages/healthadvice.aspx" },
  who: { name: "WHO technical brief, Boil water (2015)", url: "https://www.who.int/publications/i/item/WHO-FWC-WSH-15.02" },
} as const;
type Src = keyof typeof SOURCES;

type Verdict = "yes" | "boil" | "wait" | "no";
const VERDICT: Record<Verdict, { label: string; style: string }> = {
  yes: { label: "Drink it", style: "bg-emerald-100 text-emerald-900" },
  wait: { label: "Wait first", style: "bg-sky-100 text-sky-950" },
  boil: { label: "Boil first", style: "bg-amber-100 text-amber-950" },
  no: { label: "Do not drink", style: "bg-red-100 text-red-900" },
};

const CASES: { when: string; verdict: Verdict; what: string; src?: Src }[] = [
  { when: "Clear tap water, no notice for your area", verdict: "yes", what: "CWA says its water is treated and tested to the national drinking water standards.", src: "cwaQuality" },
  { when: "An official boil or quality notice names your area", verdict: "boil", what: "Follow the notice until CWA lifts it. The live card above shows it when there is one.", src: "standards" },
  { when: "Cloudy, brown, or it smells or tastes odd", verdict: "boil", what: "Boil it before drinking and call the CWA hotline on 170. The lab checks it if needed.", src: "cwaQuality" },
  { when: "White or milky", verdict: "wait", what: "Those are tiny air bubbles. Fill a glass and wait a few minutes: it clears from the bottom up.", src: "cwaPoster" },
  { when: "First water after a cut", verdict: "wait", what: "Let the tap run a few minutes to flush the water that sat still in the pipes.", src: "cwaPoster" },
  { when: "After heavy rain", verdict: "boil", what: "The Ministry of Health asks you to boil water before drinking after heavy rain. Rivers carry mud into the supply.", src: "health" },
  { when: "From your roof or yard tank", verdict: "yes", what: "Only if the tank is cleaned every 6 months and the lid stays closed. Algae, larvae or mud inside: clean it first (steps below).", src: "cwaPoster" },
  { when: "From a tanker, kept in a bucket or drum", verdict: "boil", what: "No source publishes tests of tanker water once it is in your container. Use a clean, covered container, and boil it for drinking if you are not sure.", src: "who" },
  { when: "River, canal, well or rain water", verdict: "no", what: "CWA does not treat or test it. Do not drink it untreated." },
];

const LIMITS: [string, string][] = [
  ["E. coli", "none in any 100 ml"],
  ["Coliform bacteria", "none in 95% of samples"],
  ["Turbidity (cloudiness)", "5 NTU at most"],
  ["pH", "6.5 to 8.5"],
  ["Colour", "20 Pt-Co at most"],
  ["Nitrate", "50 mg/l at most"],
  ["Lead", "0.01 mg/l at most"],
  ["Arsenic", "0.01 mg/l at most"],
  ["Fluoride", "1.5 mg/l at most"],
  ["Dissolved solids", "1,000 mg/l at most"],
];

const PLANTS: [string, number][] = [["La Marie", 130_000], ["La Nicolière", 100_000], ["Pailles", 85_000], ["Bagatelle", 45_000], ["Piton du Milieu", 35_000], ["Rivière du Poste", 20_000], ["Mont Blanc", 12_000]];

function SourceLink({ src }: { src: Src }) {
  return (
    <a href={SOURCES[src].url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs text-primary underline underline-offset-2">
      {SOURCES[src].name} <ExternalLink aria-hidden className="size-3" />
    </a>
  );
}

export function DrinkingWater() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <section className={card} aria-labelledby="cases-title">
        <h2 id="cases-title" className={title}>Which water can I drink?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Find what is coming out of your tap.</p>
        <ul className="mt-3 divide-y">
          {CASES.map((c) => (
            <li key={c.when} className="grid gap-x-4 gap-y-1 py-3 *:min-w-0 md:grid-cols-[1fr_8rem_1.6fr] md:items-start">
              <p className="font-semibold">{c.when}</p>
              <p><span className={`${tag} ${VERDICT[c.verdict].style}`}>{VERDICT[c.verdict].label}</span></p>
              <div className="text-sm">
                <p>{c.what}</p>
                {c.src && <SourceLink src={c.src} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <section className={card} aria-labelledby="how-title">
          <h2 id="how-title" className={`flex items-center gap-2 ${title}`}><ShieldCheck aria-hidden className="size-5 text-primary" />How CWA makes tap water safe</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {[["1,000,000 m³", "treated every day"], ["7", "main treatment plants"], ["160", "sampling points island-wide"], ["ISO 17025", "accredited lab, St Paul"]].map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-muted/70 px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{l}</dt>
                <dd className="text-xl font-bold tracking-[-0.02em] tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          <ol className="mt-4 flex flex-col gap-2 text-sm">
            {[
              "Alum clumps the mud and dirt together.",
              "The clumps settle in large basins.",
              "Sand filters remove what is left.",
              "Chlorine kills germs before the water leaves the plant.",
              "The lab tests pH, cloudiness and chlorine every day, and germs (coliforms, E. coli) at taps, reservoirs and boreholes.",
            ].map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">If something goes wrong, CWA seals the plant inlet and outlet, flushes the network and tests again. Heavy rain can shut down a filter station on its own.</p>
          <details className="mt-2 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">Treatment plants and capacity</summary>
            <ul className="divide-y">
              {PLANTS.map(([n, m3]) => (
                <li key={n} className="flex justify-between py-1.5"><span>{n}</span><span className="tabular-nums text-muted-foreground">{m3.toLocaleString("en-GB")} m³/day</span></li>
              ))}
              <li className="flex justify-between py-1.5"><span>60 pressure filter units</span><span className="tabular-nums text-muted-foreground">120,000 m³/day</span></li>
            </ul>
          </details>
          <div className="mt-1 flex flex-col"><SourceLink src="cwaTreatment" /><SourceLink src="cwaQuality" /></div>
        </section>

        <section className={card} aria-labelledby="limits-title">
          <h2 id="limits-title" className={`flex items-center gap-2 ${title}`}><FlaskConical aria-hidden className="size-5 text-primary" />What the law allows in tap water</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mauritius drinking water standards. The CWA lab checks samples against them.</p>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Maximum limits in drinking water</caption>
            <tbody className="divide-y">
              {LIMITS.map(([p, v]) => (
                <tr key={p}><th scope="row" className="py-2 pr-3 text-left font-medium">{p}</th><td className="py-2 text-right tabular-nums">{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <b className="font-semibold">During a drought or cyclone</b> the law lets the CWA miss these limits. In return it must tell the authorities, and they must warn the public. So in a crisis like this one, official notices matter most.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">A germ test passes below 1 bacterium per 100 ml.</p>
          <div className="flex flex-col"><SourceLink src="standards" /><SourceLink src="cwaTesting" /></div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <section className={card} aria-labelledby="tank-title">
          <h2 id="tank-title" className={`flex items-center gap-2 ${title}`}><Sparkles aria-hidden className="size-5 text-primary" />Clean your water tank</h2>
          <p className="mt-1 text-sm text-muted-foreground">At least every 6 months. With water cuts, most homes drink from a tank.</p>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {[
              "Turn off the pump and close the inlet. Tell everyone not to use the taps.",
              "Drain the tank. Use the water for plants or the yard.",
              "Scoop out the mud at the bottom, then scrub the walls with a long brush.",
              "Rinse until the water runs clear.",
              "Fill with clean water and add one cap (about 10 ml) of unscented bleach (Eau de Javel) per 1,000 litres.",
              "Leave it overnight, then run each tap for a few minutes.",
            ].map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm"><b className="font-semibold">Keep the lid closed.</b> It keeps out insects, rats and leaves, and stops the chlorine escaping.</p>
          <p className="mt-1 text-xs text-muted-foreground">Wear gloves and a mask. Never climb inside a tank alone.</p>
          <div className="flex flex-col"><SourceLink src="cwaTankGuide" /><SourceLink src="cwaPoster" /></div>
        </section>

        <div className="flex flex-col gap-4 lg:gap-6">
          <section className={card} aria-labelledby="boil-title">
            <h2 id="boil-title" className={title}>How to boil water properly</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {["Bring it to a rolling boil: big bubbles all over.", "Let it cool on its own. Do not add ice.", "Keep it in a clean container with a lid, and pour it out rather than dipping a cup in."].map((s) => (
                <li key={s} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-700" />{s}</li>
              ))}
              <li className="flex gap-2"><X aria-hidden className="mt-0.5 size-4 shrink-0 text-red-700" />Boiling does not remove chemicals or mud. If the water stays brown, call 170.</li>
            </ul>
            <SourceLink src="who" />
          </section>
          <a href="tel:170" className={`${card} flex items-center gap-4 transition-[scale] duration-150 ease-snap active:scale-[0.98]`}>
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Phone aria-hidden className="size-6" /></span>
            <span className="flex-1">
              <span className={`block ${title}`}>Something wrong with your water? Call 170</span>
              <span className="block text-sm text-muted-foreground">CWA hotline for an odd colour, taste or smell. Office: 601 5000.</span>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}

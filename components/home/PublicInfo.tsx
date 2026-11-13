"use client";

// Public information, no login: all reservoirs and the news / CWA notices, both searchable.
// Data comes from components/home/public-data.ts (P5's CSVs, read at build time).
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Search } from "lucide-react";
import type { NewsItem, Reading } from "@/components/home/public-data";
import { daysOld, fmtDate } from "@/components/home/shared";
import { LevelTank } from "@/components/ui/level-tank";

/** A reading older than this is shown as stale (P5's sources publish every few weeks at best). */
export const STALE_DAYS = 14;
// Where a supported locality sits, so its district's notices can be found. Vacoas(-Phoenix) is in Plaines-Wilhems.
const DISTRICT: Record<string, string> = { Vacoas: "Plaines-Wilhems" };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const long = { day: "numeric", month: "short", year: "numeric" } as const;
const title = "text-lg leading-snug font-bold tracking-[-0.01em]";

export function SearchBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <span className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-full bg-muted pr-4 pl-11 text-base font-normal text-foreground placeholder:text-muted-foreground"
        />
      </span>
    </label>
  );
}

export function Source({ url, children = "Source" }: { url: string | null; children?: React.ReactNode }) {
  if (!url) return <p className="py-2 text-xs text-muted-foreground">No source link</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs text-primary underline underline-offset-2">
      {children}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  );
}

/** "Measured on 8 Oct 2026" / "Published on 5 Nov 2026" + a stale chip. `now` is null until the browser clock is known. */
export function ReadingDate({ r, now }: { r: Reading; now: Date | null }) {
  if (!r.date) return null;
  const age = now ? daysOld(r.date, now) : null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {r.basis === "measured" ? "Measured on" : "Published on"} {fmtDate(r.date, long)}
      {age !== null && age > STALE_DAYS && <span className="chip min-h-6 bg-amber-100 px-2 text-xs text-amber-950">Stale: {age} days old</span>}
    </p>
  );
}

export function Reservoirs({ reservoirs, combined, now }: { reservoirs: Reading[]; combined: Reading | null; now: Date | null }) {
  const [q, setQ] = useState("");
  const shown = reservoirs.filter((r) => fold(r.name).includes(fold(q)));
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <section className="surface p-5" aria-labelledby="res-title">
        <h2 id="res-title" className={title}>Reservoirs</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest level, with date and source.</p>
        <p className="mt-1 text-xs text-muted-foreground">Blue normal, amber watch, red critical.</p>
        <SearchBox label="Search a reservoir" value={q} onChange={setQ} placeholder="e.g. Midlands" />
      </section>
      {shown.length ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {shown.map((r) => (
            <li key={r.name} className="surface flex flex-col p-4 sm:p-5">
              <LevelTank name={r.name} pct={r.pct} day={r.date} />
              {r.pct === null ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">No reading in our sources yet.</p>
              ) : (
                <>
                  <ReadingDate r={r} now={now} />
                  {r.note && <p className="mt-1 text-xs text-muted-foreground">Note: {r.note}</p>}
                  <div className="mt-auto pt-1">
                    <Source url={r.source_url} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="surface p-5 text-sm">
          No reservoir matches &quot;{q}&quot;.
        </p>
      )}
      {combined?.pct != null && combined.date && (
        <p className="surface px-5 py-4 text-sm">
          All seven together: <strong className="tabular-nums">{combined.pct.toFixed(1)}%</strong> on {fmtDate(combined.date, long)}
          {combined.note && ` (${combined.note})`}. <Source url={combined.source_url} />
        </p>
      )}
    </div>
  );
}

export function News({ items, locality }: { items: NewsItem[]; locality: string | null }) {
  const [q, setQ] = useState("");
  const district = locality ? DISTRICT[locality] : undefined;
  const shown = items.filter((i) => fold(`${i.title} ${i.areas ?? ""} ${i.kind}`).includes(fold(q)));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-6">
      <div className="flex flex-col gap-4 lg:sticky lg:top-8 lg:gap-6">
        <section className="surface p-5" aria-labelledby="news-title">
          <h2 id="news-title" className={title}>CWA notices and news</h2>
          <SearchBox label="Search a place or topic" value={q} onChange={setQ} placeholder="e.g. Moka, borehole" />
          <p className="mt-2 text-xs text-muted-foreground">Newest first.</p>
          {district && (
            <button type="button" onClick={() => setQ(district)} className="chip mt-3 min-h-11 bg-primary/10 text-primary">
              Notices for {district}, where {locality} is
            </button>
          )}
        </section>
      </div>
      {shown.length ? (
        <ol className="flex flex-col gap-3">
          {shown.map((i) => (
            <li key={`${i.date}-${i.title}`} className="surface p-5">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="chip min-h-6 bg-muted px-2 text-xs">{i.kind}</span>
                {i.areas ? "Effective" : "Dated"} {fmtDate(i.date, long)}
              </p>
              <p className="mt-2 font-semibold first-letter:uppercase">{i.title}</p>
              {i.areas && <p className="mt-1 text-sm text-muted-foreground">Areas: {i.areas}. No end date given.</p>}
              <Source url={i.source_url} />
            </li>
          ))}
        </ol>
      ) : (
        <p role="status" className="surface p-5 text-sm">Nothing matches &quot;{q}&quot;. Try a district, e.g. Moka.</p>
      )}
    </div>
  );
}

/** Small link card used on Overview and the landing to open a section. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-3 flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-primary">
      {children}
      <ChevronRight aria-hidden className="size-4" />
    </Link>
  );
}

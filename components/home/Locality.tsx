"use client";

// V5 resident cards that work for ANY locality of Mauritius (docs/SPLIT-V5.md P2 9-10, P4 4):
// supply rule (P5's supply_rules.csv via /api/supply), "Is my tap water safe to drink?" (op 26),
// the notices feed with the AI label, and "near a river?" (computed on the phone, never sent).
// Every card says "Not known yet" instead of inventing a number.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, ChevronRight, CloudRain, Droplet, ExternalLink, Info, LocateFixed, Newspaper, ShieldAlert, ShieldQuestion, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton, fmtDate } from "@/components/home/shared";
import { AI_NOTICE_LABEL, NEAR_RIVER_M, foldName, getNoticeFeed, loadRivers, nearestRiver, type FeedNotice, type Quality, type QualityReason, type Rivers } from "@/lib/queries";
import type { SupplyRow } from "@/app/api/supply/route";

const card = "surface reveal p-5";
const title = "text-lg leading-snug font-bold tracking-[-0.01em]";
const tag = "chip min-h-6 px-2 text-xs";
const day = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric" });

// ---------- supply rule per locality ----------

let supplyPromise: Promise<SupplyRow[]> | null = null;
export function loadSupply(): Promise<SupplyRow[]> {
  supplyPromise ??= fetch("/api/supply").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`supply: HTTP ${r.status}`)))).then((j) => j.rules as SupplyRow[]).catch((e) => { supplyPromise = null; throw e; });
  return supplyPromise;
}
/** Rows for a locality, matched by folded name ("L'Escalier" = "lescalier"). */
export const rulesFor = (rules: SupplyRow[], name: string) => rules.filter((r) => foldName(r.l) === foldName(name));

const BASIS = {
  locality_notice: { label: "Official notice", style: "bg-primary/10 text-primary" },
  regional_timetable: { label: "Regional timetable", style: "bg-amber-100 text-amber-950" },
  unknown: { label: "Not known yet", style: "bg-muted text-muted-foreground" },
} as const;
const FREQ: Record<string, string> = { daily: "Every day", every_2_days: "Every second day" };

export function SupplyCard({ name }: { name: string }) {
  const [rows, setRows] = useState<{ name: string; rows: SupplyRow[] } | "failed" | null>(null);
  useEffect(() => {
    let live = true;
    loadSupply().then((all) => live && setRows({ name, rows: rulesFor(all, name) })).catch(() => live && setRows("failed"));
    return () => { live = false; };
  }, [name]);
  const mine = rows && rows !== "failed" && rows.name === name ? rows.rows : null;
  const known = mine ? mine.filter((r) => r.b !== "unknown" && r.s) : [];
  const basis = known[0]?.b ?? "unknown";
  return (
    <section className={card} aria-labelledby="supply-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="supply-title" className={title}>Water supply in {name}</h2>
        {mine && <span className={`${tag} shrink-0 ${BASIS[basis].style}`}>{BASIS[basis].label}</span>}
      </div>
      {rows === "failed" ? (
        <p role="alert" className="mt-2 text-sm text-red-800">The timetable did not load. Check your connection.</p>
      ) : !mine ? (
        <Skeleton className="mt-3 h-10 w-56" />
      ) : known.length ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{FREQ[known[0].f] ?? "Planned"}</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {known.map((r) => (
              <li key={`${r.s}-${r.e}`} className="text-[clamp(1.5rem,7vw,2rem)] leading-tight font-bold tracking-[-0.02em] tabular-nums">{r.s} – {r.e}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {basis === "regional_timetable" ? `CWA timetable for the ${known[0].r} region, not a notice for ${name} itself.` : "Planned time, not a promise."}
          </p>
          <a href={known[0].u} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs text-primary underline underline-offset-2">
            CWA source{known[0].sd ? `, ${day(known[0].sd)}` : ""} <ExternalLink aria-hidden className="size-3" />
          </a>
        </>
      ) : (
        <p className="mt-2 text-sm">Not known yet. We found no CWA supply hours for {name}. Check the notices below.</p>
      )}
    </section>
  );
}

// ---------- "Is my tap water safe to drink?" (op 26). Never says "safe". ----------

const REASON: Record<QualityReason, { label: string; Icon: typeof Info }> = {
  official_notice: { label: "Official notice", Icon: ShieldAlert },
  heavy_rain: { label: "Heavy rain, last 48 h", Icon: CloudRain },
  low_reservoir: { label: "Reservoir under 20%", Icon: Waves },
};
const LEVEL = {
  official_notice: { head: "Official advisory", style: "bg-amber-50 ring-2 ring-amber-300", icon: "text-amber-700" },
  cloudy_possible: { head: "Water may be cloudy", style: "bg-sky-50 ring-1 ring-sky-200", icon: "text-sky-700" },
  none: { head: "No advisory found", style: "", icon: "text-primary" },
} as const;

export function SafeToDrink({ quality, locality, more = true }: { quality: Quality | null; locality: string | null; more?: boolean }) {
  const lv = quality ? LEVEL[quality.level] : LEVEL.none;
  return (
    <section className={`${card} ${lv.style}`} aria-labelledby="safe-title" role={quality?.level === "official_notice" ? "alert" : undefined}>
      <h2 id="safe-title" className={`flex items-center gap-2 ${title}`}>
        {!quality || quality.level === "none" ? <ShieldQuestion aria-hidden className={`size-5 shrink-0 ${lv.icon}`} /> : <ShieldAlert aria-hidden className={`size-5 shrink-0 ${lv.icon}`} />}
        Is my tap water safe to drink?
      </h2>
      {!quality && !locality ? (
        <p className="mt-2 text-sm text-muted-foreground">Choose your locality to check for advisories, heavy rain and reservoir level.</p>
      ) : !quality ? (
        <Skeleton className="mt-3 h-12 w-full" />
      ) : (
        <>
          <p className="mt-2 font-semibold">{lv.head}{locality ? ` · ${locality}` : ""}</p>
          {quality.notice && <p className="mt-1 text-sm font-medium first-letter:uppercase">{quality.notice.title} · {day(quality.notice.day)}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{quality.message}</p>
          {quality.reasons.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Why">
              {quality.reasons.map((r) => {
                const { label, Icon } = REASON[r];
                return <li key={r} className={`${tag} min-h-7 bg-card`}><Icon aria-hidden className="size-3.5" />{label}</li>;
              })}
            </ul>
          )}
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-muted/70 px-3 py-2.5 text-sm">
            <Droplet aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span><b className="font-semibold">What to do:</b> {quality.advice}</span>
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            {quality.source_url && <a href={quality.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-primary underline underline-offset-2">Source{quality.date ? `, ${day(quality.date)}` : ""} <ExternalLink aria-hidden className="size-3" /></a>}
            <a href={quality.advice_source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-primary underline underline-offset-2">WHO: boil water <ExternalLink aria-hidden className="size-3" /></a>
            {quality.rain_mm_48h !== null && <span className="inline-flex min-h-11 items-center">Rain, last 48 h: {quality.rain_mm_48h} mm</span>}
          </p>
          {more && (
            <Link href="/resident?tab=drink" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline underline-offset-2">
              Cloudy, white, from a tank or tanker? What to do <ChevronRight aria-hidden className="size-4" />
            </Link>
          )}
        </>
      )}
    </section>
  );
}

// ---------- notices feed (scraped CWA / news + ops pastes), AI-read ones labelled ----------

export function NoticeFeed({ locality, limit = 20, compact = false }: { locality: string | null; limit?: number; compact?: boolean }) {
  const key = locality ?? "";
  const [feed, setFeed] = useState<{ key: string; notices: FeedNotice[]; demo: boolean } | { key: string; failed: true } | null>(null);
  useEffect(() => {
    let live = true;
    getNoticeFeed(key || undefined)
      .then((f) => live && setFeed({ key, ...f }))
      .catch(() => live && setFeed({ key, failed: true }));
    return () => { live = false; };
  }, [key]);
  const cur = feed && feed.key === key ? feed : null;
  const rows = cur && "notices" in cur ? cur.notices.slice(0, limit) : null;
  return (
    <section className={`flex flex-col ${card}`} aria-labelledby={`feed-title-${compact ? "c" : "f"}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={`feed-title-${compact ? "c" : "f"}`} className={`flex items-center gap-2 ${title}`}>
          <Newspaper aria-hidden className="size-5 shrink-0 text-primary" />
          Latest water notices
        </h2>
        {cur && "notices" in cur && cur.demo && <span className={`${tag} shrink-0 bg-amber-100 text-amber-950`}>Last scrape</span>}
      </div>
      {!compact && <p className="mt-1 text-xs text-muted-foreground">From CWA and news sites{locality ? `, for ${locality} and island-wide` : ""}. AI-read ones: check the source.</p>}
      {cur && "failed" in cur ? (
        <p role="alert" className="mt-2 text-sm text-red-800">Notices did not load. Check your connection.</p>
      ) : !rows ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : rows.length ? (
        <ol className="mt-2 divide-y">
          {rows.map((n, i) => (
            <li key={n.url ?? `${n.published_on}-${i}`} className="py-3">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={`${tag} bg-muted capitalize`}>{n.kind}</span>
                {n.published_on && day(n.published_on)}
                {n.ai_extracted && <span className={`${tag} bg-violet-100 text-violet-900`}><Bot aria-hidden className="size-3.5" />AI-read</span>}
              </p>
              <p className={`mt-1 text-sm font-medium ${compact ? "line-clamp-2" : ""}`}>{n.summary}</p>
              {(n.localities.length > 0 || n.start_time || n.dates.length > 0) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.localities.length > 0 && <>Places: {n.localities.join(", ")}. </>}
                  {n.dates.length > 0 && <>{n.dates.map(day).join(", ")}. </>}
                  {n.start_time && <>{n.start_time}{n.end_time ? ` – ${n.end_time}` : ""}.</>}
                </p>
              )}
              {n.ai_extracted && !compact && <p className="mt-1 text-xs text-violet-900">{AI_NOTICE_LABEL}</p>}
              {n.url && !compact && (
                <a href={n.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs text-primary underline underline-offset-2">
                  {n.source === "news" ? "News source" : "CWA source"} <ExternalLink aria-hidden className="size-3" />
                </a>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No notice names {locality ?? "this place"} right now.</p>
      )}
    </section>
  );
}

// ---------- near a river? Computed here, the position never leaves the phone ----------

let riversPromise: Promise<Rivers> | null = null;
export const getRivers = () => (riversPromise ??= loadRivers().catch((e) => { riversPromise = null; throw e; }));

export function RiverCard({ name, lat, lng }: { name: string | null; lat: number | null; lng: number | null }) {
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [res, setRes] = useState<{ key: string; near: ReturnType<typeof nearestRiver> } | "failed" | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const at = here ?? (lat !== null && lng !== null ? { lat, lng } : null);
  const key = at ? `${at.lat},${at.lng}` : "";
  useEffect(() => {
    if (!key) return;
    const [la, ln] = key.split(",").map(Number);
    let live = true;
    getRivers().then((r) => live && setRes({ key, near: nearestRiver(la, ln, r) })).catch(() => live && setRes("failed"));
    return () => { live = false; };
  }, [key]);
  const near = res && res !== "failed" && res.key === key ? res.near : null;
  const where = here ? "You are" : name ? `${name} is` : "This place is";
  const locate = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("This browser cannot share a location.");
    navigator.geolocation.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGeoError("Location not shared. Your locality is used instead."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };
  const dist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
  return (
    <section className={card} aria-labelledby="river-title">
      <h2 id="river-title" className={`flex items-center gap-2 ${title}`}>
        <Waves aria-hidden className="size-5 text-primary" />
        Near a river?
      </h2>
      {!at ? (
        <p className="mt-2 text-sm text-muted-foreground">Choose your locality or use your location.</p>
      ) : res === "failed" ? (
        <p role="alert" className="mt-2 text-sm text-red-800">The river map did not load.</p>
      ) : !near ? (
        <Skeleton className="mt-3 h-10 w-full" />
      ) : near.distance_m <= NEAR_RIVER_M ? (
        <p className="mt-2 rounded-2xl bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
          <b className="font-semibold">{where} near {near.name ?? `a ${near.waterway}`}</b> (about {dist(near.distance_m)}). After heavy rain, tap water can turn cloudy and low areas can flood.
        </p>
      ) : (
        <p className="mt-2 text-sm">
          {where} about <b className="font-semibold">{dist(near.distance_m)}</b> from the nearest {near.waterway}{near.name ? ` (${near.name})` : ""}. Outside the {NEAR_RIVER_M} m flood-watch zone.
        </p>
      )}
      <Button size="tap" variant="secondary" className="mt-3" onClick={locate}>
        <LocateFixed aria-hidden /> {here ? "Update my location" : "Use my location"}
      </Button>
      {geoError && <p role="alert" className="mt-2 text-xs text-red-800">{geoError}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Worked out on your phone, never sent. River water is not drinking water.</p>
    </section>
  );
}

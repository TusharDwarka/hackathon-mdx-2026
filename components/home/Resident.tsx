"use client";

// Resident screen, in five sections (tabs): Overview, Schedule, Report, Reservoirs, News.
// Locality first: the official CWA timetable is per area, so it shows without a street.
// A street is only asked for to report, call the tanker, or see neighbours' reports.
// Reading never needs anything; reporting goes through an explicit "Continue as guest" step.
// Ops (contracts/api.md): 1 window, 2 report, 3 request, 10 reliability, 11 heat map, 14 complaint, 15 status, 16 likely time.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, ChevronDown, ChevronRight, CircleHelp, Clock, Droplet, DropletOff, MapPin, MessageSquareWarning, Truck, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayTrack } from "@/components/home/DayTrack";
import { HEAT_LEGEND, HeatMap, heatHex } from "@/components/home/HeatMap";
import { SurpriseCard } from "@/components/home/SurpriseCard";
import { MoreLink, News, ReadingDate, Reservoirs, Source } from "@/components/home/PublicInfo";
import type { PublicData } from "@/components/home/public-data";
import { minOfDay, windowStatus } from "@/components/home/time";
import { likelyWaterTime, streetStatus } from "@/components/home/rules";
import {
  DemoBanner, REPORT_LIMIT_MS, Skeleton, fmtDate, fmtHours, isoDay, loadArea, loadStreetData, plural, readArea, readGuest, readMyReport, readStreet,
  saveArea, saveGuest, saveMyReport, saveStreet, useBase, useNow, type AreaData, type ComplaintCategory, type MyReport, type RequestStatus, type StreetData,
} from "@/components/home/shared";
import { postComplaint, postReport, postRequest, type ReportType } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "schedule", label: "Schedule" },
  { id: "report", label: "Report" },
  { id: "reservoirs", label: "Reservoirs" },
  { id: "news", label: "News" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const tabHref = (t: Tab) => `/resident?tab=${t}`;

const REPORTS = [
  { type: "water_on", label: "Water is here", Icon: Droplet, style: "border-emerald-700/25 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-700 aria-pressed:text-white" },
  { type: "water_off", label: "No water", Icon: DropletOff, style: "border-red-700/25 bg-red-50 text-red-900 hover:bg-red-100 aria-pressed:border-red-700 aria-pressed:bg-red-700 aria-pressed:text-white" },
] as const;
const REPORT_LABEL = { water_on: "Water is here", water_off: "No water" };

// What neighbours reported in the last 3 hours (op 15). Reports, not a measurement.
const STATE = {
  water_on: { text: "Water is running", lower: "water", Icon: Droplet, style: "bg-emerald-50 text-emerald-800" },
  water_off: { text: "No water", lower: "no water", Icon: DropletOff, style: "bg-red-50 text-red-800" },
  none: { text: "No recent reports", lower: "", Icon: CircleHelp, style: "bg-muted text-muted-foreground" },
};

const COMPLAINTS: { category: ComplaintCategory; label: string }[] = [
  { category: "no_water", label: "No water" },
  { category: "dirty_water", label: "Dirty water" },
  { category: "tanker_no_show", label: "Tanker did not come" },
  { category: "other", label: "Other problem" },
];
const LITRES = [20, 50, 100, 200];
const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const card = "surface p-5";
const title = "text-lg leading-snug font-bold tracking-[-0.01em]";
const col = "flex min-w-0 flex-col gap-4 lg:gap-6";
// New content eases in instead of popping (CSS @starting-style: opacity + a 4px move, none with reduced motion).
const enter = "transition-[opacity,translate] duration-200 ease-snap starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0";
const tag = "chip min-h-6 px-2 text-xs";

export function Resident({ info }: { info: PublicData }) {
  const params = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview";
  const now = useNow();
  const { base, setBase, retry } = useBase();
  // undefined = not chosen in this visit: fall back to what this phone remembers.
  const [pickedArea, setPickedArea] = useState<number | null>();
  const [pickedStreet, setPickedStreet] = useState<number | null>();
  const [query, setQuery] = useState("");
  const [guestNow, setGuestNow] = useState(false);
  const [areaData, setAreaData] = useState<AreaData | null>(null);
  const [loaded, setLoaded] = useState<StreetData | null>(null);
  // My report in this session, per street. It wins over what localStorage says (null = the save failed, forget it).
  const [sent, setSent] = useState<{ streetId: number; report: MyReport | null } | null>(null);
  const [request, setRequest] = useState<RequestStatus | null>(null);
  const [litres, setLitres] = useState<number | null>(null);
  // Complaint: closed -> open (pick a category) -> the category that was sent.
  const [complaint, setComplaint] = useState<"closed" | "open" | ComplaintCategory>("closed");
  const [sendError, setSendError] = useState<"report" | "request" | "complaint" | null>(null);

  // localStorage is only read once the base data is here (base is null on the server), so the first render matches.
  const areas = base ? Object.entries(base.areaNames).map(([id, name]) => ({ id: Number(id), name })).filter((a) => base.streets.some((s) => s.area_id === a.id)) : [];
  const area = base ? (areas.find((a) => a.id === (pickedArea === undefined ? readArea() : pickedArea)) ?? null) : null;
  const areaStreets = area && base ? base.streets.filter((s) => s.area_id === area.id) : [];
  const street = areaStreets.find((s) => s.id === (pickedStreet === undefined ? readStreet() : pickedStreet)) ?? null;
  const streetId = street?.id ?? null;
  const guest = guestNow || (base ? readGuest() : false);
  const demo = base?.demo ?? false;
  const areaId = area?.id ?? null;
  const firstStreetId = areaStreets[0]?.id ?? null;
  const place = areaData !== null && areaData.id === areaId ? areaData : null; // null = loading this locality
  const data = loaded !== null && loaded.id === streetId ? loaded : null; // null = loading this street

  // On a small phone the tab bar scrolls sideways: keep the open section's tab in view.
  const tabsRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  // Per locality: today's official window (op 1) and the coming week.
  useEffect(() => {
    if (areaId === null || firstStreetId === null) return;
    let current = true;
    loadArea(areaId, firstStreetId, demo).then((d) => {
      if (current) setAreaData(d);
    });
    return () => {
      current = false;
    };
  }, [areaId, firstStreetId, demo]);

  // Per street: reliability (op 10) and the last 14 days of reports (ops 15, 16).
  useEffect(() => {
    if (streetId === null) return;
    let current = true;
    loadStreetData(streetId, demo).then((d) => {
      if (current) setLoaded(d);
    });
    return () => {
      current = false;
    };
  }, [streetId, demo]);

  // Latest request for my street in the last 24 h (requests are per street, never per household),
  // kept live by Realtime: it flips to "served" when the driver serves the stop (op 6).
  useEffect(() => {
    if (streetId === null || demo) return;
    let current = true;
    const load = async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // ignore old rounds
      const { data, error } = await supabase.from("requests").select("status").eq("street_id", streetId).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
      if (current && !error) setRequest(data[0]?.status ?? null); // on error keep what is shown
    };
    load();
    const channel = supabase
      .channel(`requests-${streetId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `street_id=eq.${streetId}` }, load)
      .subscribe();
    return () => {
      current = false;
      supabase.removeChannel(channel);
    };
  }, [streetId, demo]);

  // One report per street per 30 minutes: remembered on this phone only.
  const lastReport = sent && sent.streetId === streetId ? sent.report : streetId !== null ? readMyReport(streetId) : null;
  const mine = lastReport && now && now.getTime() - lastReport.at < REPORT_LIMIT_MS ? lastReport : null;

  const pickArea = (id: number | null) => {
    setPickedArea(id);
    saveArea(id);
    setQuery("");
  };
  const pickStreet = (id: number | null) => {
    setPickedStreet(id);
    saveStreet(id);
    setComplaint("closed");
    setRequest(null);
    setLitres(null);
    setSendError(null);
  };

  // Op 2. The tap answers at once; if the save fails we say so and undo it. Demo mode stays local.
  const report = async (type: ReportType) => {
    if (!street || mine) return; // one report per street per 30 minutes
    const mineNow = { type, at: new Date().getTime() };
    setSent({ streetId: street.id, report: mineNow });
    saveMyReport(street.id, mineNow);
    setSendError(null);
    try {
      if (!demo) await postReport(street.id, type);
    } catch (e) {
      console.warn("report not saved:", e);
      setSent({ streetId: street.id, report: null });
      saveMyReport(street.id, null);
      setSendError("report");
      return;
    }
    // My own report shows in the status, on today's track and on the heat map straight away.
    setLoaded((d) => (d && d.id === street.id ? { ...d, reports: [...d.reports, { type, created_at: new Date().toISOString() }] } : d));
    if (type === "water_on") setBase((b) => b && { ...b, hoursDry: { ...b.hoursDry, [street.id]: 0 } });
  };

  // Op 3, same pattern. Free. The button is replaced by "Tanker requested" at once, so a second tap cannot send twice.
  // ponytail: the litres stay on this screen until P3 adds requests.litres and postRequest(streetId, litres).
  const requestWater = async () => {
    if (!street || !litres || request === "waiting") return;
    const before = request;
    setRequest("waiting");
    setSendError(null);
    try {
      if (!demo) await postRequest(street.id);
    } catch (e) {
      console.warn("request not saved:", e);
      setRequest(before);
      setSendError("request");
    }
  };

  // Op 14: second tap of the complaint. No free text, street only.
  const complain = async (category: ComplaintCategory) => {
    if (!street) return;
    setComplaint(category);
    setSendError(null);
    try {
      if (!demo) await postComplaint(street.id, category);
    } catch (e) {
      console.warn("complaint not saved:", e);
      setComplaint("open");
      setSendError("complaint");
    }
  };

  const today = now?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const win = place?.win ?? null;
  const status = win && now ? windowStatus(win.start_time, win.end_time, minOfDay(now)) : null;
  const midnight = now ? new Date(now).setHours(0, 0, 0, 0) : 0;
  const todayReports = data && now ? data.reports.filter((r) => new Date(r.created_at).getTime() >= midnight) : [];
  const saidOn = todayReports.filter((r) => r.type === "water_on").length;
  const saidOff = todayReports.length - saidOn;
  const live = data && now && street && !data.failed ? streetStatus(street.id, data.reports, now) : null; // op 15
  const likely = data && now ? likelyWaterTime(data.reports, now) : null; // op 16
  const state = STATE[live?.status ?? "none"];
  const matches = areas.filter((a) => fold(a.name).includes(fold(query)));
  const mav = info.reservoirs[0];

  // ---------- pieces used by several sections ----------

  const placeCard = (
    <section className={card} aria-labelledby="place-title">
      {area ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your locality</p>
              <h1 id="place-title" className="text-2xl leading-tight font-bold tracking-[-0.02em]">{area.name}</h1>
            </div>
            <button type="button" onClick={() => pickArea(null)} className="chip min-h-11 shrink-0 bg-muted hover:bg-primary/10">Change</button>
          </div>
          <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
            <span>Your street <span className="font-normal text-muted-foreground">(optional)</span></span>
            <span className="relative">
              <select
                className="h-12 w-full appearance-none rounded-full bg-muted pr-11 pl-4 text-base font-normal text-foreground"
                value={street?.id ?? ""}
                onChange={(e) => pickStreet(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Not set</option>
                {areaStreets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            The timetable is the same for all of {area.name}. Your street is only needed to report, call the tanker, or see your neighbours&apos; reports. We never ask for your house.
          </p>
        </>
      ) : (
        <>
          <h1 id="place-title" className="text-2xl leading-tight font-bold tracking-[-0.02em]">Where do you live?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose your locality to see its official CWA water timetable. No account needed.</p>
          <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
            Search your locality
            <input
              type="search"
              value={query}
              disabled={!base}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={base ? "e.g. Vacoas" : "Loading…"}
              className="h-12 w-full rounded-full bg-muted px-4 text-base font-normal text-foreground placeholder:text-muted-foreground"
            />
          </label>
          {base &&
            (matches.length ? (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Localities with a timetable in Kot Delo?</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {matches.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => pickArea(a.id)} className="chip min-h-11 bg-primary/10 text-primary transition-[scale] duration-150 ease-snap active:scale-[0.97]">
                        <MapPin aria-hidden className="size-4" />
                        {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p role="status" className="mt-3 text-sm">
                Kot Delo? has no CWA timetable for &quot;{query.trim()}&quot; yet. Supported now: {areas.map((a) => a.name).join(", ")}.{" "}
                <Link href={tabHref("news")} className="text-primary underline underline-offset-2">News and notices</Link> cover other places.
              </p>
            ))}
        </>
      )}
    </section>
  );

  /** Today's official window for the locality. `full` adds the 24 h track and today's report counts. */
  const todayCard = (full: boolean) => (
    <section className={card} aria-labelledby="window-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="window-title" className={title}>Today&apos;s official window</h2>
        <span className={`${tag} bg-primary/10 text-primary`}>Official CWA</span>
      </div>
      <p className="min-h-5 text-sm text-muted-foreground">{area?.name}{today && ` · ${today}`}</p>
      {!place ? (
        <Skeleton className="mt-4 h-10 w-56" />
      ) : place.failed ? (
        <p role="alert" className="mt-3 text-sm text-red-800">The timetable did not load. Check your connection, then choose your locality again.</p>
      ) : win ? (
        <>
          <p className="mt-4 text-[2.5rem] leading-none font-bold tracking-[-0.02em] tabular-nums">{win.start_time} – {win.end_time}</p>
          {status && (
            <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${status.tone === "now" ? "text-primary" : "text-muted-foreground"}`}>
              <span aria-hidden className={`size-2 rounded-full ${status.tone === "now" ? "bg-primary" : "bg-muted-foreground/60"}`} />
              {status.label}
            </p>
          )}
          {full && (
            <>
              <DayTrack start={win.start_time} end={win.end_time} reports={todayReports} now={now} />
              {street && (
                <p className="mt-4 text-sm">
                  {todayReports.length
                    ? `Today on ${street.name}: ${plural(saidOn, "report", "reports")} of water, ${plural(saidOff, "report", "reports")} of no water.`
                    : `No reports from ${street.name} yet today.`}
                </p>
              )}
            </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">The planned supply time, not a promise that water reaches every house.</p>
          <Source url={win.source_url && win.source_url !== "#" ? win.source_url : null}>
            CWA communiqué{win.source_date && `, ${fmtDate(win.source_date, { day: "numeric", month: "short", year: "numeric" })}`}
          </Source>
        </>
      ) : (
        <p className="mt-3 text-sm">No water supply is scheduled for {area?.name} today. If your tank is empty, you can call the tanker under Report.</p>
      )}
    </section>
  );

  const needStreet = (what: string) => (
    <p className={`${card} text-sm`}>
      <span className={`block ${title}`}>Add your street</span>
      <span className="mt-1 block text-muted-foreground">Choose your street above to {what}. Reports and the tanker work street by street, never by house.</span>
    </p>
  );

  const statusCard = street && (
    <section aria-labelledby="status-title" className={`flex flex-col gap-4 ${card}`}>
      <h2 id="status-title" className={title}>Water on {street.name} now</h2>
      {!data || !now ? (
        <Skeleton className="h-14 w-full" />
      ) : data.failed ? (
        <p role="alert" className="text-sm text-red-800">Reports did not load. Check your connection, then choose your street again.</p>
      ) : (
        <div className="flex items-center gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-full ${state.style}`}>
            <state.Icon aria-hidden className="size-7" />
          </span>
          <div className="min-w-0">
            {/* One household is a signal, not proof: unconfirmed reports say "reported", never a flat fact. */}
            <p className="text-2xl leading-tight font-bold tracking-[-0.01em]">{live?.status && live.trust === "unconfirmed" ? `Reported: ${state.lower}` : state.text}</p>
            {live && live.reports > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className={`chip min-h-7 px-2.5 text-xs ${live.trust === "confirmed" ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}>
                  {live.trust === "confirmed" ? <BadgeCheck aria-hidden className="size-4" /> : <CircleHelp aria-hidden className="size-4" />}
                  {live.trust === "confirmed" ? "Confirmed" : "Unconfirmed"}
                </span>
                {live.reports === 1
                  ? `A resident reported ${state.lower} near this street in the last 3 hours.`
                  : `${live.agree} of ${live.reports} reports in the last 3 hours agree.`}
              </p>
            )}
            {live && live.reports === 0 && <p className="mt-1 text-sm text-muted-foreground">Nobody on this street has reported in the last 3 hours.</p>}
          </div>
        </div>
      )}
      <MoreLink href={tabHref("report")}>Report water on {street.name}</MoreLink>
    </section>
  );

  const likelyCard = (
    <section className={card} aria-labelledby="likely-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="likely-title" className={title}>When water usually comes</h2>
        <span className={`${tag} bg-muted`}>Estimate</span>
      </div>
      {!street ? (
        <p className="mt-2 text-sm text-muted-foreground">Choose your street to see when neighbours usually get water there.</p>
      ) : !data ? (
        <Skeleton className="mt-3 h-6 w-full" />
      ) : likely ? (
        <p className="mt-2 flex items-start gap-2 text-sm">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Usually between <strong className="font-semibold tabular-nums">{likely.from} and {likely.to}</strong> on {street.name}: neighbours reported water then on {likely.days_hit} of the {likely.days_total} days with water in the last 2 weeks.
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Not enough reports yet to say when water usually comes on {street.name}.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">From neighbours&apos; past reports. Not an official time and not a promise.</p>
    </section>
  );

  const reservoirMini = (
    <section className={card} aria-labelledby="mav-title">
      <h2 id="mav-title" className={title}>{mav.name} reservoir</h2>
      {mav.pct === null ? (
        <p className="mt-2 text-sm text-muted-foreground">No verified reading yet.</p>
      ) : (
        <>
          <p className="mt-2 text-3xl leading-none font-bold tracking-[-0.02em] tabular-nums">
            {mav.pct.toFixed(1)}%<span className="ml-1.5 text-sm font-medium text-muted-foreground">full</span>
          </p>
          <ReadingDate r={mav} now={now} />
        </>
      )}
      <MoreLink href={tabHref("reservoirs")}>All seven reservoirs</MoreLink>
    </section>
  );

  const latestNews = info.news[0] && (
    <section className={card} aria-labelledby="latest-title">
      <h2 id="latest-title" className={title}>Latest news</h2>
      <p className="mt-1 text-xs text-muted-foreground">{fmtDate(info.news[0].date, { day: "numeric", month: "short", year: "numeric" })} · {info.news[0].kind}</p>
      <p className="mt-1 text-sm font-medium first-letter:uppercase">{info.news[0].title}</p>
      <MoreLink href={tabHref("news")}>All news and notices</MoreLink>
    </section>
  );

  const heatCard = base && (
    <section className={card} aria-labelledby="heat-title">
      <h2 id="heat-title" className={title}>Hours without water</h2>
      <p className="mb-3 text-sm text-muted-foreground">Since the last &quot;Water is here&quot; report, street by street.</p>
      <HeatMap streets={areaStreets} hoursDry={base.hoursDry} myStreetId={streetId} />
      <ul aria-hidden className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {HEAT_LEGEND.map((b) => (
          <li key={b.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: b.hex }} />
            {b.label}
          </li>
        ))}
      </ul>
      <ul className="mt-1 max-h-80 divide-y overflow-y-auto pr-3">
        {areaStreets.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: heatHex(base.hoursDry[s.id]) }} />
            <span className={`flex-1 ${s.id === streetId ? "font-semibold" : ""}`}>
              {s.name}
              {s.id === streetId && <span className="font-normal text-muted-foreground"> · your street</span>}
            </span>
            <span className="text-muted-foreground tabular-nums">{fmtHours(base.hoursDry[s.id])}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  const loading = (
    <div className={card}>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-4 h-12 w-full" />
    </div>
  );

  // ---------- the five sections ----------

  const overview = (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className={col}>
        {base ? placeCard : loading}
        {area && todayCard(false)}
        {area && (statusCard || needStreet("see what your neighbours report"))}
      </div>
      <div className={col}>
        <SurpriseCard />
        {reservoirMini}
        {latestNews}
        {area && heatCard}
      </div>
    </div>
  );

  const week = place?.week;
  const schedule = (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className={col}>
        {base ? placeCard : loading}
        {area && todayCard(true)}
        {area && likelyCard}
      </div>
      {area && (
        <div className={col}>
          <section className={card} aria-labelledby="week-title">
            <div className="flex items-center justify-between gap-2">
              <h2 id="week-title" className={title}>Next 7 days</h2>
              <span className={`${tag} bg-primary/10 text-primary`}>Official CWA</span>
            </div>
            {!place ? (
              <Skeleton className="mt-4 h-40 w-full" />
            ) : !week ? (
              <p role="alert" className="mt-3 text-sm text-red-800">The week did not load. Today&apos;s window above still applies.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {week.map(({ day, win: w }) => (
                  <li key={day} className={`flex items-center justify-between gap-3 py-3 text-sm ${now && day === isoDay(now) ? "font-semibold" : ""}`}>
                    <span>{fmtDate(day, { weekday: "short", day: "numeric", month: "short" })}{now && day === isoDay(now) && " · today"}</span>
                    {w ? <span className="tabular-nums">{w.start_time} – {w.end_time}</span> : <span className="text-muted-foreground">No supply planned</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {street ? (
            <section className={card} aria-labelledby="reliability-title">
              <h2 id="reliability-title" className={title}>Schedule vs reality</h2>
              {!data ? (
                <Skeleton className="mt-3 h-20 w-full" />
              ) : data.reliability.days === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Not enough history for {street.name} yet. Every &quot;Water is here&quot; tap during the official window counts as a day on time.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.01em]">On time {data.reliability.onTime} of {plural(data.reliability.days, "day", "days")}</p>
                  <p className="text-sm text-muted-foreground">Days when neighbours on {street.name} reported water inside the official window.</p>
                  <ol className="mt-4 flex gap-1.5">
                    {data.reliability.perDay.map((d) => (
                      <li key={d.date} className="flex flex-1 flex-col items-center gap-1.5 text-xs text-muted-foreground">
                        <span aria-hidden className={`flex h-10 w-full items-center justify-center rounded-xl text-white ${d.onTime ? "bg-emerald-700" : "bg-red-600"}`}>
                          {d.onTime ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
                        </span>
                        {fmtDate(d.date, { weekday: "short" })}
                        <span className="sr-only">{d.onTime ? "on time" : "late or no water"}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          ) : (
            needStreet("compare the schedule with what neighbours saw")
          )}
        </div>
      )}
    </div>
  );

  const reportSection = (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className={col}>
        {base ? placeCard : loading}
        {area && !guest && (
          <section className={`flex flex-col gap-3 ${card}`} aria-labelledby="guest-title">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <UserRound aria-hidden className="size-6" />
            </span>
            <h2 id="guest-title" className={title}>Report as a guest</h2>
            <p className="text-sm text-muted-foreground">
              No account and no name. What you send is stored by street only, so neighbours and the tanker driver can see it. Reading the schedule, reservoirs and news never needs this.
            </p>
            <Button size="tap" onClick={() => { saveGuest(); setGuestNow(true); }}>Continue as guest</Button>
            <p className="text-xs text-muted-foreground">
              Tanker driver or CWA staff? Use the <Link href="/#staff" className="text-primary underline underline-offset-2">staff entry</Link>.
            </p>
          </section>
        )}
        {area && guest && !street && needStreet("report, call the tanker or make a complaint")}
        {area && guest && street && (
          <section aria-labelledby="report-title" className={`flex flex-col gap-3 ${card}`}>
            <h2 id="report-title" className={title}>Is water running at your place now?</h2>
            <p className="-mt-2 text-sm text-muted-foreground">One tap, for {street.name}. Your report alone does not confirm anything: it counts with your neighbours&apos;.</p>
            <div className="grid grid-cols-2 gap-3">
              {REPORTS.map(({ type, label, Icon, style }) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={mine?.type === type}
                  disabled={!!mine}
                  onClick={() => report(type)}
                  className={`flex h-14 items-center justify-center gap-2 rounded-full border text-base font-semibold transition-[scale,background-color,border-color,color,opacity] duration-150 ease-snap active:scale-[0.97] disabled:pointer-events-none disabled:not-aria-pressed:opacity-45 ${style}`}
                >
                  {mine?.type === type ? <Check aria-hidden className="size-5" /> : <Icon aria-hidden className="size-5" />}
                  {label}
                </button>
              ))}
            </div>
            {mine && (
              <p role="status" className={`text-sm text-muted-foreground ${enter}`}>
                Thanks. You reported &quot;{REPORT_LABEL[mine.type]}&quot; at {hhmm(mine.at)}. You can report for this street again at {hhmm(mine.at + REPORT_LIMIT_MS)}.
              </p>
            )}
            {sendError === "report" && <p role="alert" className="text-sm text-red-800">Your report was not sent. Check your connection and tap again.</p>}
          </section>
        )}
      </div>
      {area && guest && street && (
        <div className={col}>
          <section aria-labelledby="tanker-title" className={`flex flex-col gap-3 ${card}`}>
            <div>
              <h2 id="tanker-title" className={title}>Need the tanker?</h2>
              <p className="text-sm text-muted-foreground">Free. Puts {street.name} on the driver&apos;s stop list.</p>
            </div>
            {request === "served" && (
              <p role="status" className={`flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900 ${enter}`}>
                <Check aria-hidden className="size-5 shrink-0" />
                Served. The tanker has delivered to {street.name}.
              </p>
            )}
            {request === "waiting" ? (
              <Link href={street ? `/map?street=${street.id}` : "/map"} role="status" className={`flex min-h-16 items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3 text-primary ${enter}`}>
                <Truck aria-hidden className="size-6 shrink-0" />
                <span className="flex-1">
                  <span className="block font-semibold">Tanker requested{litres && ` · ${litres} L`}</span>
                  <span className="block text-sm">Pending: waiting for the driver. See it live on the map</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0" />
              </Link>
            ) : (
              <>
                <div role="group" aria-labelledby="litres-label">
                  <p id="litres-label" className="text-sm font-medium">How much water do you need?</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {LITRES.map((l) => (
                      <button
                        key={l}
                        type="button"
                        aria-pressed={litres === l}
                        onClick={() => setLitres(l)}
                        className="h-12 rounded-full bg-muted text-sm font-semibold tabular-nums transition-[scale,background-color,color] duration-150 ease-snap hover:bg-primary/10 active:scale-[0.97] aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      >
                        {l} L
                      </button>
                    ))}
                  </div>
                </div>
                <Button size="tap" disabled={!litres} onClick={requestWater}>
                  <Truck aria-hidden />
                  {litres ? `Request ${litres} L` : "Choose an amount"}
                </Button>
              </>
            )}
            {sendError === "request" && <p role="alert" className="text-sm text-red-800">Your request was not sent. Check your connection and tap again.</p>}
          </section>

          <section aria-labelledby="complaint-title" className={`flex flex-col gap-3 ${card}`}>
            <div>
              <h2 id="complaint-title" className={title}>Something wrong?</h2>
              <p className="text-sm text-muted-foreground">Two taps send a complaint for {street.name} to CWA operations. No name, no message.</p>
            </div>
            {complaint === "closed" ? (
              <Button size="tap" variant="secondary" onClick={() => setComplaint("open")}>
                <MessageSquareWarning aria-hidden />
                Make a complaint
              </Button>
            ) : complaint === "open" ? (
              <div className={`grid grid-cols-2 gap-2 ${enter}`}>
                {COMPLAINTS.map((c) => (
                  <button
                    key={c.category}
                    type="button"
                    onClick={() => complain(c.category)}
                    className="min-h-14 rounded-2xl bg-muted px-3 text-sm font-semibold transition-[scale,background-color] duration-150 ease-snap hover:bg-primary/10 active:scale-[0.97]"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <p role="status" className={`flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-3 font-semibold text-primary ${enter}`}>
                <Check aria-hidden className="size-5 shrink-0" />
                Complaint sent: {COMPLAINTS.find((c) => c.category === complaint)?.label}.
              </p>
            )}
            {sendError === "complaint" && <p role="alert" className="text-sm text-red-800">Your complaint was not sent. Check your connection and choose the category again.</p>}
          </section>
        </div>
      )}
    </div>
  );

  const sections: Record<Tab, React.ReactNode> = {
    overview,
    schedule,
    report: reportSection,
    reservoirs: <Reservoirs reservoirs={info.reservoirs} combined={info.combined} now={now} />,
    news: <News items={info.news} locality={area?.name ?? null} />,
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-6 lg:max-w-6xl lg:px-6">
      {/* Section tabs: real links (?tab=), so Back, reload and sharing a section all work. Scrolls sideways inside itself on small phones. */}
      <nav aria-label="Resident sections" className="sticky top-0 z-[1050] -mx-4 px-4 pt-3 pb-3 lg:top-(--nav-h) lg:mx-0 lg:px-0 lg:pt-5">
        <ul ref={tabsRef} className="glass flex gap-1 overflow-x-auto rounded-full p-1.5 shadow-card [scrollbar-width:none] lg:mx-auto lg:max-w-xl">
          {TABS.map((t) => (
            <li key={t.id} className="flex-1 shrink-0">
              <Link
                href={tabHref(t.id)}
                replace
                scroll={false}
                aria-current={tab === t.id ? "page" : undefined}
                className="flex h-10 items-center justify-center rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[background-color,color] duration-150 ease-snap hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {demo && (
        <div className="mb-4 lg:mb-6">
          <DemoBanner onRetry={retry} />
        </div>
      )}
      <div key={tab} className={enter}>
        {sections[tab]}
      </div>
      <p className="surface mt-4 px-5 py-4 text-center text-xs text-muted-foreground lg:mt-6">Reports and requests are stored by street, never by house or person.</p>
    </main>
  );
}

"use client";

// Resident screen, in five sections (?tab=): Overview, Schedule, Report, Reservoirs, News.
// The sections are picked in the app shell (sidebar from 1024px, tab bar on phones), not on this page.
// Overview is a dashboard: today's window + street (wide card), reservoir dial, street status,
// tanker, schedule vs reality, hours without water and the latest CWA notices.
// Locality first: the official CWA timetable is per area, so it shows without a street.
// A street is only asked for to report, call the tanker, or see neighbours' reports.
// Reading never needs anything; reporting goes through an explicit "Continue as guest" step.
// Ops (contracts/api.md): 1 window, 2 report, 3 request, 10 reliability, 11 heat map, 14 complaint, 15 status, 16 likely time.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Check, ChevronDown, ChevronRight, CircleHelp, Clock, Droplet, DropletOff, LogIn, LogOut, MapPin, MessageSquareWarning, Route, Search, Truck, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomWaves, PageHeader } from "@/components/ui/brand";
import { Gauge } from "@/components/ui/gauge";
import { DayTrack } from "@/components/home/DayTrack";
import { HEAT_LEGEND, HeatMap, heatHex } from "@/components/home/HeatMap";
import { SurpriseCard } from "@/components/home/SurpriseCard";
import { MoreLink, News, ReadingDate, Reservoirs, Source } from "@/components/home/PublicInfo";
import type { PublicData } from "@/components/home/public-data";
import { minOfDay, toMin, windowStatus } from "@/components/home/time";
import { ForecastCard, Planner, SaveWaterCard } from "@/components/home/WaterDay";
import { NoticeFeed, RiverCard, SafeToDrink, SupplyCard } from "@/components/home/Locality";
import { OnboardingTour } from "@/components/home/Guide";
import { DrinkingWater } from "@/components/home/DrinkingWater";
import { loadWaterPoints, type WaterPoint } from "@/components/map/data";
import { likelyWaterTime, streetStatus } from "@/components/home/rules";
import {
  DemoBanner, REPORT_LIMIT_MS, Skeleton, fmtDate, logOut, fmtHours, isoDay, loadArea, loadStreetData, plural, readArea, readGuest, readMyReport, readSpot, readStreet,
  saveArea, saveGuest, saveMyReport, saveSpot, saveStreet, useBase, useNow, useUser, type AreaData, type ComplaintCategory, type MyReport, type RequestStatus, type StreetData,
} from "@/components/home/shared";
import {
  ApiError, computeForecast, computeWaterQuality, foldName, getForecast, getMyComplaints, getWaterQuality, loadPlaces, placeLabel, postComplaint, postReport, postRequest, reservoirTier, searchPlaces,
  type Complaint, type Forecast, type Place, type Quality, type ReportType, type ReservoirTier,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";

const SEEN_KEY = "kotdelo.seenResolved";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "drink", label: "Is my tap water safe?" },
  { id: "schedule", label: "Water schedule" },
  { id: "report", label: "Report water" },
  { id: "request", label: "Request a tanker" },
  { id: "reservoirs", label: "Reservoirs" },
  { id: "news", label: "CWA notices" },
] as const;
const TIER: Record<ReservoirTier, { label: string; style: string }> = {
  normal: { label: "Normal", style: "bg-emerald-50 text-emerald-900" },
  watch: { label: "Watch", style: "bg-amber-100 text-amber-950" },
  critical: { label: "Critical", style: "bg-red-50 text-red-900" },
};
// Tier limits read from P3's reservoirTier, so the explanation can never drift from the rule.
const from = (t: ReservoirTier) => [...Array(101).keys()].find((p) => reservoirTier(p) === t)!;
const TIER_MEANS: Record<ReservoirTier, string> = {
  normal: `${from("normal")}% full or more. Usual supply.`,
  watch: `${from("watch")} to ${from("normal") - 1}% full. Cuts more likely, plan ahead.`,
  critical: `Under ${from("watch")}% full. Longer cuts likely.`,
};
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
const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const card = "surface reveal p-5";
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
  // Complaint: closed -> open (pick a category) -> the category that was sent.
  const [complaint, setComplaint] = useState<"closed" | "open" | ComplaintCategory>("closed");
  const [sendError, setSendError] = useState<"report" | "request" | "complaint" | null>(null);
  const [tierOpen, setTierOpen] = useState(false);
  // V5: account (complaints need it), island-wide places search, any locality of Mauritius.
  const user = useUser();
  const [places, setPlaces] = useState<Place[] | "failed" | null>(null);
  const [pickedSpot, setPickedSpot] = useState<Place | null>();
  const [mine14, setMine14] = useState<Complaint[] | null>(null); // my own complaints (signed in)
  // Resolved complaints already shown to me (this phone). Nothing renders from it until mine14 loads, so no hydration gap.
  const [seenResolved, setSeenResolved] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; } });

  // localStorage is only read once the base data is here (base is null on the server), so the first render matches.
  const areas = base ? Object.entries(base.areaNames).map(([id, name]) => ({ id: Number(id), name })).filter((a) => base.streets.some((s) => s.area_id === a.id)) : [];
  const area = base ? (areas.find((a) => a.id === (pickedArea === undefined ? readArea() : pickedArea)) ?? null) : null;
  const areaStreets = area && base ? base.streets.filter((s) => s.area_id === area.id) : [];
  const street = areaStreets.find((s) => s.id === (pickedStreet === undefined ? readStreet() : pickedStreet)) ?? null;
  const streetId = street?.id ?? null;
  const guest = guestNow || !!user || (base ? readGuest() : false);
  const demo = base?.demo ?? false;
  const areaId = area?.id ?? null;
  // A searched locality that has no streets in our database: timetable, safety, notices and river still work.
  const spot = area ? null : base ? (pickedSpot === undefined ? readSpot() : pickedSpot) : null;
  const localityName = area?.name ?? spot?.l ?? null;
  const centre = area && areaStreets.length
    ? { lat: areaStreets.reduce((s, x) => s + x.lat, 0) / areaStreets.length, lng: areaStreets.reduce((s, x) => s + x.lng, 0) / areaStreets.length }
    : spot ? { lat: spot.lat, lng: spot.lng } : null;
  const firstStreetId = areaStreets[0]?.id ?? null;
  const place = areaData !== null && areaData.id === areaId ? areaData : null; // null = loading this locality
  const data = loaded !== null && loaded.id === streetId ? loaded : null; // null = loading this street

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

  // Ops 24 + 26 from P3's routes, per locality. On failure the page computes them itself (see below).
  const [remote, setRemote] = useState<{ areaId: number; forecast: Forecast | null } | null>(null);
  useEffect(() => {
    if (areaId === null || demo) return;
    let current = true;
    getForecast(areaId)
      .then((forecast) => {
        if (current) setRemote({ areaId, forecast });
      })
      .catch((e) => console.warn("forecast API not reachable, computing on the page:", e));
    return () => {
      current = false;
    };
  }, [areaId, demo]);

  // Op 26 V5 "Is my tap water safe to drink?" for any locality (reasons: notice, heavy rain, low reservoir).
  // The route has its own demo fallback; if it is not reachable at all, the page computes the same rule.
  const [remoteQ, setRemoteQ] = useState<{ name: string; quality: Quality | null } | null>(null); // quality null = API not reachable
  useEffect(() => {
    if (!localityName) return;
    let current = true;
    getWaterQuality(undefined, localityName)
      .catch((e) => (areaId !== null && e instanceof ApiError && e.code === "unknown_locality" ? getWaterQuality(areaId) : Promise.reject(e)))
      .then((quality) => current && setRemoteQ({ name: localityName, quality }))
      .catch((e) => {
        console.warn("quality API not reachable, computing on the page:", e);
        if (current) setRemoteQ({ name: localityName, quality: null });
      });
    return () => {
      current = false;
    };
  }, [localityName, areaId]);

  // Island-wide search index (~0.5 MB), fetched once the visitor starts typing.
  useEffect(() => {
    if (!query.trim() || places) return;
    loadPlaces().then(setPlaces).catch(() => setPlaces("failed"));
  }, [query, places]);

  // My complaints (signed in only): what I sent, and whether CWA closed it.
  useEffect(() => {
    if (!user || demo) return;
    let current = true;
    const load = () => getMyComplaints().then((c) => current && setMine14(c)).catch(() => current && setMine14((m) => m ?? []));
    load();
    const poll = setInterval(load, 60_000); // CWA resolving it shows up within a minute
    return () => {
      current = false;
      clearInterval(poll);
    };
  }, [user, demo, complaint]);
  const newlyResolved = user && mine14 ? mine14.filter((c) => c.status === "resolved" && !seenResolved.includes(c.id)) : [];
  const dismissResolved = () => {
    const ids = [...seenResolved, ...newlyResolved.map((c) => c.id)];
    setSeenResolved(ids);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
  };

  // Public water points (P3's water_points table from P5's file) + any in data/ at build time.
  const [dbPoints, setDbPoints] = useState<WaterPoint[]>([]);
  useEffect(() => {
    if (demo) return;
    loadWaterPoints().then(setDbPoints).catch(() => {}); // none = the card says so
  }, [demo]);

  // One report per street per 30 minutes: remembered on this phone only.
  const lastReport = sent && sent.streetId === streetId ? sent.report : streetId !== null ? readMyReport(streetId) : null;
  const mine = lastReport && now && now.getTime() - lastReport.at < REPORT_LIMIT_MS ? lastReport : null;

  const pickArea = (id: number | null) => {
    setPickedArea(id);
    saveArea(id);
    setQuery("");
  };
  const pickSpot = (p: Place | null) => {
    setPickedSpot(p);
    saveSpot(p);
  };
  const changePlace = () => {
    pickArea(null);
    pickSpot(null);
  };
  // A search hit: one of our areas (with streets) opens the full screen, any other place opens its locality cards.
  const pickPlace = (p: Place) => {
    const a = areas.find((x) => foldName(x.name) === foldName(p.l));
    if (a) {
      pickSpot(null);
      pickArea(a.id);
      const s = p.l !== p.n ? base?.streets.find((x) => x.area_id === a.id && foldName(x.name) === foldName(p.n)) : undefined;
      if (s) pickStreet(s.id);
      return;
    }
    pickSpot(p);
    setQuery("");
  };
  const pickStreet = (id: number | null) => {
    setPickedStreet(id);
    saveStreet(id);
    setComplaint("closed");
    setRequest(null);
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
  const requestWater = async () => {
    if (!street || request === "waiting") return;
    const before = request;
    setRequest("waiting");
    setSendError(null);
    try {
      if (!demo) await postRequest(street.id); // V5: no litres, one request = one household
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
      setComplaint(e instanceof ApiError && e.code === "sign_in_required" ? "closed" : "open");
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
  const hits = Array.isArray(places) ? searchPlaces(places, query, 8) : [];
  const mav = info.reservoirs[0];

  // Water day (docs/WATER-DAY-SPLIT.md): P3's forecast (op 24) and quality (op 26) from the API; if the API
  // is not reachable (or in demo mode) P3's same pure functions run here on the timetable this page already has.
  const tier = mav.pct === null ? null : reservoirTier(mav.pct);
  const todayIso = now ? isoDay(now) : null;
  const apiDay = remote && remote.areaId === areaId ? remote : null;
  const rows = place && !place.failed ? (place.week ?? (place.win && todayIso ? [{ day: todayIso, win: place.win }] : [])).flatMap((d) => (d.win ? [{ ...d.win, day: d.day }] : [])) : null;
  const forecast = apiDay ? apiDay.forecast : rows && now ? computeForecast(rows, tier, likely, now) : null;
  const q = remoteQ && remoteQ.name === localityName ? remoteQ : null;
  // Offline fallback: the same pure rule; the Mare aux Vacoas tier only stands in for our Plaines Wilhems areas.
  const quality = q?.quality ?? (q && now ? computeWaterQuality([], area ? tier : null, now, { locality: localityName }) : null);
  // Today's window while it is still ahead or running, else the next official one, else the forecast (labelled estimate).
  const upcoming =
    place && !place.failed && now && todayIso
      ? place.win && minOfDay(now) < toMin(place.win.end_time)
        ? { day: todayIso, win: place.win, kind: "official" as const }
        : (() => {
            const next = place.week?.find((d) => d.day > todayIso && d.win);
            return next?.win ? { day: next.day, win: next.win, kind: "official" as const } : forecast ? { day: forecast.next.day, win: forecast.next, kind: forecast.basis === "official" ? ("official" as const) : ("estimate" as const) } : null;
          })()
      : null;

  // ---------- pieces used by several sections ----------

  const placeCard = (
    <section data-tour="place" className={card} aria-labelledby="place-title">
      {area ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your locality</p>
              <h2 id="place-title" className="text-2xl leading-tight font-bold tracking-[-0.02em]">{area.name}</h2>
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
            Needed only to report or request a tanker. Never your house.
          </p>
        </>
      ) : spot ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your locality</p>
              <h2 id="place-title" className="text-2xl leading-tight font-bold tracking-[-0.02em]">{spot.l}</h2>
              <p className="text-sm text-muted-foreground">{spot.l !== spot.n ? `${spot.n} · ` : ""}{spot.d}</p>
            </div>
            <button type="button" onClick={changePlace} className="chip min-h-11 shrink-0 bg-muted hover:bg-primary/10">Change</button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Timetable, water safety, notices and rivers work here. Reports and the tanker are live in {areas.map((a) => a.name).join(", ")} for now.
          </p>
        </>
      ) : (
        <>
          <h2 id="place-title" className="text-2xl leading-tight font-bold tracking-[-0.02em]">Where do you live?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Any town, village or street in Mauritius. No account needed.</p>
          <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
            Search your locality or street
            <span className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                disabled={!base}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={base ? "e.g. L'Escalier, Chamarel, Rose-Belle" : "Loading…"}
                className="h-12 w-full rounded-full bg-muted pr-4 pl-11 text-base font-normal text-foreground placeholder:text-muted-foreground"
              />
            </span>
          </label>
          {base && query.trim() && (
            places === null ? (
              <Skeleton className="mt-3 h-24 w-full" />
            ) : places === "failed" ? (
              <p role="alert" className="mt-3 text-sm text-red-800">Search did not load. Pick one of the localities below.</p>
            ) : hits.length ? (
              <ul className="mt-3 flex flex-col divide-y rounded-2xl bg-muted/60">
                {hits.map((p) => {
                  const live = areas.some((a) => foldName(a.name) === foldName(p.l));
                  return (
                    <li key={`${p.n}|${p.l}|${p.lat}`}>
                      <button type="button" onClick={() => pickPlace(p)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-[background-color] duration-150 ease-snap hover:bg-primary/10">
                        <MapPin aria-hidden className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate font-medium">{placeLabel(p)}</span>
                        {live && <span className={`${tag} shrink-0 bg-primary/10 text-primary`}>Live reports</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p role="status" className="mt-3 text-sm">No place called &quot;{query.trim()}&quot; in Mauritius. Check the spelling.</p>
            )
          )}
          {base && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Live reports and tanker</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {areas.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => { pickSpot(null); pickArea(a.id); }} className="chip min-h-11 bg-primary/10 text-primary transition-[scale] duration-150 ease-snap active:scale-[0.97]">
                      <MapPin aria-hidden className="size-4" />
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
          <p className="mt-2 text-xs text-muted-foreground">Planned time, not a promise.</p>
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
            {live && live.reports === 0 && <p className="mt-1 text-sm text-muted-foreground">No reports in the last 3 hours.</p>}
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
        <p className="mt-2 text-sm text-muted-foreground">Choose your street to see this.</p>
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
        <p className="mt-2 text-sm text-muted-foreground">Not enough reports yet.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">From neighbours&apos; reports, not official.</p>
    </section>
  );

  // Reservoir dial (op 12: real, dated, sourced reading; the tier thresholds are demo ones and say so).
  const reservoirDial = (
    <section className={`flex flex-col ${card}`} aria-labelledby="mav-title">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="mav-title" className={title}>Reservoir level</h2>
          <p className="text-sm text-muted-foreground">{mav.name}</p>
        </div>
        {mav.pct !== null && (
          <button
            type="button"
            aria-expanded={tierOpen}
            aria-controls="tier-help"
            onClick={() => setTierOpen((o) => !o)}
            className={`${tag} min-h-9 shrink-0 gap-1 font-semibold transition-[scale] duration-150 ease-snap active:scale-[0.96] ${TIER[reservoirTier(mav.pct)].style}`}
          >
            {TIER[reservoirTier(mav.pct)].label}
            <CircleHelp aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {mav.pct !== null && tierOpen && (
        <p id="tier-help" className={`mt-3 rounded-2xl bg-muted px-4 py-3 text-sm ${enter}`}>
          <span className="block">
            <b className="font-semibold">{TIER[reservoirTier(mav.pct)].label}</b> = {TIER_MEANS[reservoirTier(mav.pct)]}
          </span>
          <span className="block text-muted-foreground">
            {mav.date ? `Reading of ${fmtDate(mav.date, { day: "numeric", month: "short", year: "numeric" })}. ` : ""}Demo limits, not official CWA ones.
          </span>
        </p>
      )}
      {mav.pct === null ? (
        <p className="mt-3 text-sm text-muted-foreground">No reading in our sources yet.</p>
      ) : (
        <>
          <Gauge value={mav.pct} label={`${mav.name} is ${mav.pct.toFixed(1)}% full`} className="mt-3 max-w-56">
            <span className="text-center">
              <span className="block text-4xl leading-none font-bold tracking-[-0.03em] tabular-nums">{Math.round(mav.pct)}%</span>
              <span className="text-xs text-white/85">full</span>
            </span>
          </Gauge>
          <ReadingDate r={mav} now={now} />
        </>
      )}
      <div className="mt-auto">
        <MoreLink href={tabHref("reservoirs")}>All reservoirs</MoreLink>
      </div>
    </section>
  );

  // Blue call-to-action card: request state for my street, or the way to request.
  const tankerCard = (
    <section aria-labelledby="tanker-cta-title" className="wave-panel relative flex flex-col overflow-hidden rounded-3xl p-5 pb-20 shadow-card">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/20">
        <Truck aria-hidden className="size-6" />
      </span>
      <h2 id="tanker-cta-title" className="mt-4 text-lg leading-snug font-bold tracking-[-0.01em]">
        {request === "waiting" ? "Tanker requested" : request === "served" ? "Tanker delivered" : "Need the tanker?"}
      </h2>
      <p className="mt-1 text-sm text-white/85">
        {request === "waiting"
          ? "Waiting for the driver. Follow the truck live."
          : request === "served"
            ? `The tanker has served ${street?.name ?? "your street"}.`
            : `Free, for ${street?.name ?? "your street"}.`}
      </p>
      <Link
        href={request === "waiting" && street ? `/map?street=${street.id}` : tabHref("request")}
        className="relative z-10 mt-4 inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full bg-white px-5 text-sm font-semibold text-primary transition-[scale] duration-150 ease-snap active:scale-[0.97]"
      >
        {request === "waiting" ? "See it on the map" : "Request a tanker"}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
      <BottomWaves className="h-16 text-white/30" />
    </section>
  );

  // Op 10: days when neighbours reported water inside the official window.
  const reliabilityCard = street ? (
    <section className={card} aria-labelledby="reliability-title">
      <h2 id="reliability-title" className={title}>Schedule vs reality</h2>
      {!data ? (
        <Skeleton className="mt-3 h-20 w-full" />
      ) : data.reliability.days === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Not enough history yet. Each &quot;Water is here&quot; during the window counts.
        </p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold tracking-[-0.01em]">On time {data.reliability.onTime} of {plural(data.reliability.days, "day", "days")}</p>
          <p className="text-sm text-muted-foreground">Days water was reported inside the official window.</p>
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
  );

  // Overview's wide card: locality tabs, today's official window on a 24 h track, and the street panel.
  const todayHero = area && (
    <section className={`${card} lg:p-6`} aria-labelledby="hero-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="hero-title" className={title}>Your water today</h2>
        <span className={`${tag} bg-primary/10 text-primary`}>Official CWA</span>
      </div>
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Locality">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={a.id === area.id}
            onClick={() => pickArea(a.id)}
            className="chip min-h-10 shrink-0 bg-muted text-muted-foreground transition-[background-color,color] duration-150 ease-snap hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {a.name}
          </button>
        ))}
        <button type="button" onClick={() => pickArea(null)} className="chip min-h-10 shrink-0 bg-transparent text-primary">
          <MapPin aria-hidden className="size-4" /> Change locality
        </button>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-[1.25fr_1fr] md:gap-6">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{today}</p>
          {!place ? (
            <Skeleton className="mt-3 h-12 w-56" />
          ) : place.failed ? (
            <p role="alert" className="mt-3 text-sm text-red-800">The timetable did not load. Check your connection, then choose your locality again.</p>
          ) : win ? (
            <>
              <p className="mt-2 text-[2.75rem] leading-none font-bold tracking-[-0.03em] tabular-nums lg:text-[3.25rem]">{win.start_time} – {win.end_time}</p>
              {status && (
                <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${status.tone === "now" ? "text-primary" : "text-muted-foreground"}`}>
                  <span aria-hidden className={`size-2 rounded-full ${status.tone === "now" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                  {status.label}
                </p>
              )}
              <DayTrack start={win.start_time} end={win.end_time} reports={todayReports} now={now} />
              <p className="mt-2 text-xs text-muted-foreground">Planned time, not a promise.</p>
              <Source url={win.source_url && win.source_url !== "#" ? win.source_url : null}>
                CWA communiqué{win.source_date && `, ${fmtDate(win.source_date, { day: "numeric", month: "short", year: "numeric" })}`}
              </Source>
            </>
          ) : (
            <p className="mt-3 text-sm">No water supply is scheduled for {area.name} today. If your tank is empty, you can call the tanker.</p>
          )}
        </div>
        <div className="flex flex-col divide-y rounded-2xl bg-muted/70 px-4">
          <label className="flex flex-col gap-1.5 py-3.5 text-sm font-medium">
            <span>Your street <span className="font-normal text-muted-foreground">(optional)</span></span>
            <span className="relative">
              <select
                className="h-11 w-full appearance-none rounded-full bg-card pr-11 pl-4 text-base font-normal text-foreground"
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
          <div className="py-3.5 text-sm">
            <p className="font-medium">Reports today</p>
            <p className="text-muted-foreground">
              {!street ? "Choose your street to see them." : !data ? <Skeleton className="inline-block h-4 w-32 align-middle" /> : todayReports.length ? `${plural(saidOn, "report", "reports")} of water, ${plural(saidOff, "report", "reports")} of no water` : "None yet today."}
            </p>
            {street && data && todayReports.length > 0 && (
              <span aria-hidden className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
                <span className="rounded-full bg-emerald-600" style={{ width: `${(saidOn / todayReports.length) * 100}%` }} />
                <span className="flex-1 rounded-full bg-red-500" />
              </span>
            )}
          </div>
          <div className="py-3.5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              Water usually comes <span className={`${tag} min-h-5 bg-card`}>Estimate</span>
            </p>
            <p className="text-muted-foreground">
              {!street ? "Choose your street to see it." : !data ? <Skeleton className="inline-block h-4 w-32 align-middle" /> : likely ? <><strong className="font-semibold text-foreground tabular-nums">{likely.from} – {likely.to}</strong> on {likely.days_hit} of {likely.days_total} days</> : "Not enough reports yet."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );

  const heatCard = base && (
    <section className={card} aria-labelledby="heat-title">
      <h2 id="heat-title" className={title}>Hours without water</h2>
      <p className="mb-3 text-sm text-muted-foreground">Since the last &quot;Water is here&quot;, per street.</p>
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

  // Dashboard: 1 column on phones, 2 on tablets, 3 from 1280px.
  const overview = (
    <div className="grid gap-4 md:grid-cols-2 lg:gap-6 xl:grid-cols-3">
      {/* P1 passes the revealed constraint here (title, body, href); renders nothing until then. */}
      <SurpriseCard />
      {!area && (
        <>
          <div className="md:col-span-2">{base ? placeCard : loading}</div>
          {spot ? <SafeToDrink quality={quality} locality={localityName} /> : reservoirDial}
        </>
      )}
      {spot && (
        <>
          <div className="md:col-span-2"><SupplyCard name={spot.l} /></div>
          <RiverCard name={spot.l} lat={spot.lat} lng={spot.lng} />
          <div className="md:col-span-2"><NoticeFeed locality={spot.l} limit={4} compact /></div>
          {reservoirDial}
        </>
      )}
      {!spot && (
        <>
          <div className="md:col-span-2">
            {area && !place ? (
              loading
            ) : (
              <Planner place={area?.name ?? null} day={upcoming?.day ?? null} win={upcoming?.win ?? null} kind={upcoming?.kind ?? "sample"} now={now} today={todayIso} />
            )}
          </div>
          <div className="flex flex-col gap-4 md:col-span-2 md:grid md:grid-cols-2 lg:gap-6 xl:col-span-1 xl:flex">
            <SafeToDrink quality={quality} locality={localityName} />
            <ForecastCard forecast={forecast} loading={!!area && !place} today={todayIso} />
          </div>
        </>
      )}
      {area && (
        <>
          <div className="md:col-span-2">{todayHero}</div>
          {reservoirDial}
        </>
      )}
      {area && street && statusCard}
      {area && !street && <div className="xl:col-span-1">{needStreet("see what your neighbours report and track the tanker")}</div>}
      {tankerCard}
      {area && street && reliabilityCard}
      {area && <div className="md:col-span-2">{heatCard}</div>}
      {area && <RiverCard name={area.name} lat={centre?.lat ?? null} lng={centre?.lng ?? null} />}
      {!spot && (
        <div className="flex flex-col md:col-span-2 xl:col-span-1">
          <NoticeFeed locality={localityName} limit={3} compact />
          <MoreLink href={tabHref("news")}>All notices and advisories</MoreLink>
        </div>
      )}
      <div className="md:col-span-2 xl:col-span-3">
        <SaveWaterCard points={[...dbPoints, ...info.points.filter((p) => !dbPoints.some((d) => d.name === p.name))]} from={street ? { lat: street.lat, lng: street.lng, name: street.name } : null} />
      </div>
    </div>
  );

  const week = place?.week;
  const schedule = (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className={col}>
        {base ? placeCard : loading}
        {spot && <SupplyCard name={spot.l} />}
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
          {reliabilityCard}
        </div>
      )}
    </div>
  );

  // Report and Request share the same first steps: locality, guest, street.
  const gate = (what: string) => (
    <>
      {base ? placeCard : loading}
      {area && !guest && (
        <section className={`flex flex-col gap-3 ${card}`} aria-labelledby="guest-title">
          <h2 id="guest-title" className={title}>Continue as a guest</h2>
          <p className="-mt-2 text-sm text-muted-foreground">No account, no name. Saved by street only.</p>
          <Button size="tap" onClick={() => { saveGuest(); setGuestNow(true); }}>Continue as guest</Button>
          <Link href={`/login?mode=login&next=${encodeURIComponent(tabHref(tab))}`} className="inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-primary underline underline-offset-2">
            <LogIn aria-hidden className="size-4" /> Have an account? Log in
          </Link>
          <p className="text-xs text-muted-foreground">
            Driver or CWA staff? <Link href="/login" className="text-primary underline underline-offset-2">Sign in here</Link>.
          </p>
        </section>
      )}
      {area && guest && !street && needStreet(what)}
      {spot && (
        <p className={`${card} text-sm`}>
          <span className={`block ${title}`}>Not live in {spot.l} yet</span>
          <span className="mt-1 block text-muted-foreground">
            To {what}, we need the streets of your locality. They are in for {areas.map((a) => a.name).join(", ")}. Tap Change above to pick one.
          </span>
        </p>
      )}
    </>
  );

  const reportSection = (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className={col}>
        {gate("report")}
        {area && guest && street && (
          <section aria-labelledby="report-title" className={`flex flex-col gap-3 ${card}`}>
            <h2 id="report-title" className={title}>Water at your place now?</h2>
            <p className="-mt-2 text-sm text-muted-foreground">For {street.name}. It counts with your neighbours&apos; reports.</p>
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
                Sent: &quot;{REPORT_LABEL[mine.type]}&quot; at {hhmm(mine.at)}. Next report from {hhmm(mine.at + REPORT_LIMIT_MS)}.
              </p>
            )}
            {sendError === "report" && <p role="alert" className="text-sm text-red-800">Not sent. Check your connection and tap again.</p>}
          </section>
        )}
      </div>
      {area && guest && street && (
        <div className={col}>
          <section aria-labelledby="complaint-title" className={`flex flex-col gap-3 ${card}`}>
            <div>
              <h2 id="complaint-title" className={title}>Something wrong?</h2>
              <p className="text-sm text-muted-foreground">Two taps send a complaint for {street.name} to CWA.</p>
            </div>
            {!user ? (
              <>
                <Link
                  href={`/login?mode=login&next=${encodeURIComponent(tabHref("report"))}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-secondary px-5 text-sm font-semibold text-secondary-foreground transition-[scale] duration-150 ease-snap active:scale-[0.97]"
                >
                  <LogIn aria-hidden className="size-4" />
                  {user === undefined ? "Checking your account…" : "Sign in to make a complaint"}
                </Link>
                <p className="text-xs text-muted-foreground">An account stops fake complaints. Your email is never shown to CWA or anyone else.</p>
              </>
            ) : complaint === "closed" ? (
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
            {sendError === "complaint" && <p role="alert" className="text-sm text-red-800">Not sent. Check your connection and choose again.</p>}
            {user && mine14 && mine14.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm font-semibold">My complaints</p>
                <ul className="mt-1 divide-y text-sm">
                  {mine14.slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">{COMPLAINTS.find((x) => x.category === c.category)?.label ?? c.category} · {fmtDate(c.created_at.slice(0, 10), { day: "numeric", month: "short" })}</span>
                      <span className={`${tag} shrink-0 ${c.status === "open" ? "bg-amber-100 text-amber-950" : "bg-emerald-50 text-emerald-900"}`}>{c.status === "open" ? "Open" : "Resolved"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );

  // Request: one tap, no litres (a household never chooses tank capacity; ops plans the load).
  const requestSection = (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className={col}>
        {gate("request a tanker")}
        {area && guest && street && (
          <section aria-labelledby="tanker-title" className={`flex flex-col gap-3 ${card}`}>
            <div>
              <h2 id="tanker-title" className={title}>Request a tanker</h2>
              <p className="text-sm text-muted-foreground">Free. Adds {street.name} to the driver&apos;s stops.</p>
            </div>
            {request === "served" && (
              <p role="status" className={`flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900 ${enter}`}>
                <Check aria-hidden className="size-5 shrink-0" />
                Served on {street.name}.
              </p>
            )}
            {request === "waiting" ? (
              <Link href={`/map?street=${street.id}`} role="status" className={`flex min-h-16 items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3 text-primary ${enter}`}>
                <Truck aria-hidden className="size-6 shrink-0" />
                <span className="flex-1">
                  <span className="block font-semibold">Tanker requested</span>
                  <span className="block text-sm">Waiting for the driver. See it live</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0" />
              </Link>
            ) : (
              <Button size="tap" onClick={requestWater}>
                <Truck aria-hidden />
                I need a tanker
              </Button>
            )}
            {sendError === "request" && <p role="alert" className="text-sm text-red-800">Not sent. Check your connection and tap again.</p>}
          </section>
        )}
      </div>
      <div className={col}>
        <Link href={street ? `/map?street=${street.id}` : "/map"} className={`flex items-center gap-3 ${card}`}>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Route aria-hidden className="size-6" /></span>
          <span className="flex-1">
            <span className={`block ${title}`}>Follow the tanker live</span>
            <span className="block text-sm text-muted-foreground">The truck on the map, stop by stop.</span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );

  const sections: Record<Tab, React.ReactNode> = {
    overview,
    drink: (
      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6">
          <SafeToDrink quality={quality} locality={localityName} more={false} />
          {centre ? <RiverCard name={localityName} lat={centre.lat} lng={centre.lng} /> : spot ? <RiverCard name={spot.l} lat={spot.lat} lng={spot.lng} /> : base ? placeCard : loading}
        </div>
        <DrinkingWater />
      </div>
    ),
    schedule,
    report: reportSection,
    request: requestSection,
    reservoirs: <Reservoirs reservoirs={info.reservoirs} combined={info.combined} now={now} />,
    news: (
      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6">
          <NoticeFeed locality={localityName} />
          <div className={col}>
            <SafeToDrink quality={quality} locality={localityName} />
            {centre && <RiverCard name={localityName} lat={centre.lat} lng={centre.lng} />}
          </div>
        </div>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.01em]">CWA announcements and timeline</h2>
        <News items={info.news} locality={area?.name ?? null} />
      </div>
    ),
  };

  const hour = now?.getHours() ?? 9;
  const hello = now ? (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening") : "Hello";
  const heading = tab === "overview" ? (area ? `Water in ${area.name}` : "Your water") : TABS.find((t) => t.id === tab)!.label;

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-6 md:max-w-3xl lg:max-w-7xl lg:px-8 lg:pt-8">
      <PageHeader eyebrow={`${hello}${today ? ` · ${today}` : ""}`} title={heading} logo={<OnboardingTour drop />}>
        <div className="flex flex-wrap gap-2">
        <Link
          href={tabHref("report")}
          className={`chip shrink-0 shadow-card ${guest ? "bg-card" : "bg-primary text-primary-foreground"}`}
        >
          <UserRound aria-hidden className="size-4" />
          {guest ? (street ? street.name : user ? "Choose your street" : "Guest") : "Continue as guest"}
        </Link>
        {user === null && (
          <Link href={`/login?mode=login&next=${encodeURIComponent(`/resident${tab === "overview" ? "" : `?tab=${tab}`}`)}`} className="chip shrink-0 bg-card shadow-card">
            <LogIn aria-hidden className="size-4" /> Log in
          </Link>
        )}
        {(user || guest) && (
          <button type="button" onClick={logOut} className="chip shrink-0 bg-card shadow-card lg:hidden">
            <LogOut aria-hidden className="size-4" /> Log out
          </button>
        )}
        </div>
      </PageHeader>
      <div className="mt-5 lg:mt-7">
        {demo && (
          <div className="mb-4 lg:mb-6">
            <DemoBanner onRetry={retry} />
          </div>
        )}
        {newlyResolved.length > 0 && (
          <div role="status" className={`mb-4 flex items-center gap-3 rounded-3xl bg-emerald-50 py-2 pr-2 pl-5 text-sm text-emerald-900 lg:mb-6 ${enter}`}>
            <BadgeCheck aria-hidden className="size-5 shrink-0" />
            <p className="flex-1 py-1">
              <b>CWA resolved your complaint:</b> {newlyResolved.map((c) => COMPLAINTS.find((x) => x.category === c.category)?.label ?? c.category).join(", ")}.
            </p>
            <button type="button" onClick={dismissResolved} className="min-h-11 shrink-0 rounded-full bg-emerald-900 px-4 font-semibold text-emerald-50">OK</button>
          </div>
        )}
      </div>
      <div key={tab} className={enter}>
        {sections[tab]}
      </div>
    </main>
  );
}

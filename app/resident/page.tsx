"use client";

// Resident screen (contracts/api.md ops 1, 2, 3, 10, 11, 14, 15, 16): one street, its water
// status with trust, the likely water time, one-tap reports (one per 30 minutes), the free
// tanker request, a complaint in two taps, schedule vs reality, heat map.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Check, ChevronDown, ChevronRight, CircleHelp, Clock, Droplet, DropletOff, ExternalLink, MessageSquareWarning, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayTrack } from "@/components/home/DayTrack";
import { HEAT_LEGEND, HeatMap, heatHex } from "@/components/home/HeatMap";
import { SurpriseCard } from "@/components/home/SurpriseCard";
import { minOfDay, windowStatus } from "@/components/home/time";
import { likelyWaterTime, streetStatus } from "@/components/home/rules";
import { DemoBanner, REPORT_LIMIT_MS, Skeleton, fmtDate, fmtHours, loadStreetData, plural, postComplaint, readMyReport, readStreet, saveMyReport, saveStreet, useBase, useNow, type ComplaintCategory, type MyReport, type RequestStatus, type StreetData } from "@/components/home/shared";
import { supabase } from "@/lib/supabase";
import { postReport, postRequest, type ReportType } from "@/lib/queries";

const REPORTS = [
  { type: "water_on", label: "Water is here", Icon: Droplet, style: "border-emerald-700/25 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-700 aria-pressed:text-white" },
  { type: "water_off", label: "No water", Icon: DropletOff, style: "border-red-700/25 bg-red-50 text-red-900 hover:bg-red-100 aria-pressed:border-red-700 aria-pressed:bg-red-700 aria-pressed:text-white" },
] as const;
const REPORT_LABEL = { water_on: "Water is here", water_off: "No water" };

// What neighbours reported in the last 3 hours (op 15). Reports, not a measurement.
const STATE = {
  water_on: { text: "Water is running", Icon: Droplet, style: "bg-emerald-50 text-emerald-800" },
  water_off: { text: "No water", Icon: DropletOff, style: "bg-red-50 text-red-800" },
  none: { text: "No recent reports", Icon: CircleHelp, style: "bg-muted text-muted-foreground" },
};

const COMPLAINTS: { category: ComplaintCategory; label: string }[] = [
  { category: "no_water", label: "No water" },
  { category: "dirty_water", label: "Dirty water" },
  { category: "tanker_no_show", label: "Tanker did not come" },
  { category: "other", label: "Other problem" },
];
const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const card = "surface p-5";
const title = "text-lg leading-snug font-bold tracking-[-0.01em]";
// New status lines ease in instead of popping (CSS @starting-style, interruptible, no movement if reduced motion).
const enter = "transition-[opacity,translate] duration-200 ease-snap starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0";

export default function Resident() {
  const now = useNow();
  const { base, setBase } = useBase();
  const [picked, setPicked] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<StreetData | null>(null);
  // My report in this session, per street. It wins over what localStorage says (null = the save failed, forget it).
  const [sent, setSent] = useState<{ streetId: number; report: MyReport | null } | null>(null);
  const [request, setRequest] = useState<RequestStatus | null>(null);
  // Complaint: closed -> open (pick a category) -> the category that was sent.
  const [complaint, setComplaint] = useState<"closed" | "open" | ComplaintCategory>("closed");
  const [sendError, setSendError] = useState<"report" | "request" | "complaint" | null>(null);

  const street = base?.streets.find((s) => s.id === (picked ?? readStreet())) ?? null;
  const streetId = street?.id ?? null;
  const demo = base?.demo ?? false;
  const data = loaded !== null && loaded.id === streetId ? loaded : null; // null = loading this street

  // Per street: today's window (op 1), reliability (op 10), recent reports.
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

  const pickStreet = (id: number) => {
    setPicked(id);
    setComplaint("closed");
    setRequest(null);
    setSendError(null);
    saveStreet(id);
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
    // My own report shows on today's track and the heat map straight away.
    setLoaded((d) => (d && d.id === street.id ? { ...d, reports: [...d.reports, { type, created_at: new Date().toISOString() }] } : d));
    if (type === "water_on") setBase((b) => b && { ...b, hoursDry: { ...b.hoursDry, [street.id]: 0 } });
  };

  // Op 3, same pattern. Free, one tap.
  const requestWater = async () => {
    if (!street) return;
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

  const areaName = base ? (base.areaNames[street?.area_id ?? base.streets[0].area_id] ?? "") : "";
  const today = now?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const win = data?.win ?? null;
  const status = win && now ? windowStatus(win.start_time, win.end_time, minOfDay(now)) : null;
  const midnight = now ? new Date(now).setHours(0, 0, 0, 0) : 0;
  const todayReports = data && now ? data.reports.filter((r) => new Date(r.created_at).getTime() >= midnight) : [];
  const saidOn = todayReports.filter((r) => r.type === "water_on").length;
  const saidOff = todayReports.length - saidOn;
  const live = data && now && !data.failed ? streetStatus(data.reports, now) : null; // op 15
  const likely = data && now ? likelyWaterTime(data.reports, now) : null; // op 16
  const state = STATE[live?.state ?? "none"];
  const mapHref = street ? `/map?street=${street.id}` : "/map";

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-6 lg:max-w-6xl lg:px-6 lg:pt-8">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <section className={card}>
            <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em]">Your street&apos;s water</h1>
            <p className="mt-1 text-sm text-muted-foreground">Where is the water?{areaName && ` · ${areaName}`}</p>
            <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
              Your street
              <span className="relative">
                <select
                  className="h-12 w-full appearance-none rounded-full bg-muted pr-11 pl-4 text-base font-normal text-foreground disabled:text-muted-foreground"
                  value={street?.id ?? ""}
                  disabled={!base}
                  onChange={(e) => pickStreet(Number(e.target.value))}
                >
                  <option value="" disabled>{base ? "Choose your street" : "Loading streets…"}</option>
                  {base?.streets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground" />
              </span>
            </label>
          </section>

          {demo && <DemoBanner />}

          {!base ? (
            <div className={card}>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-4 h-10 w-56" />
              <Skeleton className="mt-5 h-9 w-full" />
            </div>
          ) : !street ? (
            <p className={card}>
              <span className={`block ${title}`}>Choose your street to start.</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                You will see today&apos;s official water window, what your neighbours report, and you can call the tanker.
              </span>
            </p>
          ) : (
            <>
              <section aria-labelledby="status-title" className={`flex flex-col gap-4 ${card}`}>
                <h2 id="status-title" className={title}>Water on {street.name} now</h2>
                {!data || !now ? (
                  <Skeleton className="h-14 w-full" />
                ) : (
                  <>
                    <div className="flex items-center gap-4">
                      <span className={`grid size-14 shrink-0 place-items-center rounded-full ${state.style}`}>
                        <state.Icon aria-hidden className="size-7" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-2xl leading-tight font-bold tracking-[-0.01em]">{state.text}</p>
                        {live && live.total > 0 && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                            <span className={`chip min-h-7 px-2.5 text-xs ${live.trust === "confirmed" ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}>
                              {live.trust === "confirmed" ? <BadgeCheck aria-hidden className="size-4" /> : <CircleHelp aria-hidden className="size-4" />}
                              {live.trust === "confirmed" ? "Confirmed" : "Unconfirmed"}
                            </span>
                            {live.agree} of {plural(live.total, "report", "reports")} in the last 3 hours
                          </p>
                        )}
                        {live && live.total === 0 && <p className="mt-1 text-sm text-muted-foreground">Nobody on this street has reported in the last 3 hours.</p>}
                      </div>
                    </div>
                    <p className="flex items-start gap-2 text-sm">
                      <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      {likely ? (
                        <span>
                          Water usually comes between <strong className="font-semibold tabular-nums">{likely.from} and {likely.to}</strong>: neighbours reported it then on {likely.days_hit} of the {likely.days_total} days with water in the last 2 weeks.
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not enough reports yet to say when water usually comes here.</span>
                      )}
                    </p>
                  </>
                )}
                <div className="flex flex-col gap-3 border-t pt-4">
                  <h3 className="font-semibold">Is water running at your place now?</h3>
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
                  {sendError === "report" && (
                    <p role="alert" className="text-sm text-red-800">Your report was not sent. Check your connection and tap again.</p>
                  )}
                </div>
              </section>

              <section className={card} aria-labelledby="window-title">
                <h2 id="window-title" className={title}>Today&apos;s official water window</h2>
                <p className="min-h-5 text-sm text-muted-foreground">{areaName}{today && ` · ${today}`}</p>
                {!data ? (
                  <>
                    <Skeleton className="mt-4 h-10 w-56" />
                    <Skeleton className="mt-5 h-9 w-full" />
                  </>
                ) : data.failed ? (
                  <p role="alert" className="mt-3 text-sm text-red-800">
                    The timetable did not load. Check your connection, then choose your street again.
                  </p>
                ) : win ? (
                  <>
                    <p className="mt-4 text-[2.5rem] leading-none font-bold tracking-[-0.02em] tabular-nums">{win.start_time} – {win.end_time}</p>
                    {status && (
                      <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${status.tone === "now" ? "text-primary" : "text-muted-foreground"}`}>
                        <span aria-hidden className={`size-2 rounded-full ${status.tone === "now" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                        {status.label}
                      </p>
                    )}
                    <DayTrack start={win.start_time} end={win.end_time} reports={todayReports} now={now} />
                    <p className="mt-4 text-sm">
                      {todayReports.length
                        ? `Today on ${street.name}: ${plural(saidOn, "report", "reports")} of water, ${plural(saidOff, "report", "reports")} of no water.`
                        : `No reports from ${street.name} yet today. Yours can be the first.`}
                    </p>
                    {win.source_url ? (
                      <a href={win.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-12 items-center gap-1 text-xs text-primary underline underline-offset-2">
                        Source: CWA communiqué{win.source_date && `, ${fmtDate(win.source_date, { day: "numeric", month: "short", year: "numeric" })}`}
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    ) : (
                      <p className="mt-1 py-2 text-xs text-muted-foreground">Source: CWA communiqué</p>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm">
                    No water supply is scheduled for {areaName} today. If your tank is empty, call the tanker below.
                  </p>
                )}
              </section>

              <section aria-labelledby="tanker-title" className={`flex flex-col gap-3 ${card}`}>
                <div>
                  <h2 id="tanker-title" className={title}>Need the tanker?</h2>
                  <p className="text-sm text-muted-foreground">Free. One tap puts {street.name} on the driver&apos;s stop list.</p>
                </div>
                {request === "served" && (
                  <p role="status" className={`flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900 ${enter}`}>
                    <Check aria-hidden className="size-5 shrink-0" />
                    Served. The tanker has delivered to {street.name}.
                  </p>
                )}
                {request === "waiting" ? (
                  <Link href={mapHref} role="status" className={`flex min-h-16 items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3 text-primary ${enter}`}>
                    <Truck aria-hidden className="size-6 shrink-0" />
                    <span className="flex-1">
                      <span className="block font-semibold">Tanker requested</span>
                      <span className="block text-sm">Waiting for the driver. See it live on the map</span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0" />
                  </Link>
                ) : (
                  <Button size="tap" onClick={requestWater}>
                    <Truck aria-hidden />
                    I need water
                  </Button>
                )}
                {sendError === "request" && (
                  <p role="alert" className="text-sm text-red-800">Your request was not sent. Check your connection and tap again.</p>
                )}
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
                {sendError === "complaint" && (
                  <p role="alert" className="text-sm text-red-800">Your complaint was not sent. Check your connection and choose the category again.</p>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <SurpriseCard />

          {street && (
            <section className={card} aria-labelledby="reliability-title">
              <h2 id="reliability-title" className={title}>Schedule vs reality</h2>
              {!data ? (
                <>
                  <Skeleton className="mt-3 h-8 w-52" />
                  <Skeleton className="mt-4 h-14 w-full" />
                </>
              ) : data.reliability.days === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Not enough history for {street.name} yet. Every &quot;Water is here&quot; tap during the official window counts as a day on time.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.01em]">
                    On time {data.reliability.onTime} of {plural(data.reliability.days, "day", "days")}
                  </p>
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
          )}

          {base ? (
            <section className={card} aria-labelledby="heat-title">
              <h2 id="heat-title" className={title}>Hours without water</h2>
              <p className="mb-3 text-sm text-muted-foreground">Since the last &quot;Water is here&quot; report, street by street.</p>
              <HeatMap streets={base.streets} hoursDry={base.hoursDry} myStreetId={streetId} />
              <ul aria-hidden className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {HEAT_LEGEND.map((b) => (
                  <li key={b.label} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: b.hex }} />
                    {b.label}
                  </li>
                ))}
              </ul>
              <ul className="mt-1 max-h-80 divide-y overflow-y-auto pr-3">
                {base.streets.map((s) => (
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
          ) : (
            <div className={card}>
              <Skeleton className="h-6 w-44" />
              <Skeleton className="mt-4 h-44 w-full" />
            </div>
          )}

          <p className="surface px-5 py-4 text-center text-xs text-muted-foreground">
            Reports and requests are stored by street, never by house or person.
          </p>
        </div>
      </div>
    </main>
  );
}

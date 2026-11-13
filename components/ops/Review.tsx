"use client";

// /ops Report review (op 15): every street's reports of the last 3 h with the reason for its status.
// A contradicted report is flagged for a look, never called false: neighbours are context, not proof.
import { useState } from "react";
import type { OpsData } from "@/components/ops/data";
import type { StreetStatus, Trust } from "@/components/ops/rules";

const ORDER: Record<Trust, number> = { suspect: 0, unconfirmed: 1, confirmed: 2, none: 3 };
const BADGE: Record<Trust, { label: string; style: string }> = {
  suspect: { label: "Check: neighbours disagree", style: "bg-amber-100 text-amber-900" },
  unconfirmed: { label: "Unconfirmed", style: "bg-muted text-foreground" },
  confirmed: { label: "Confirmed", style: "bg-emerald-100 text-emerald-900" },
  none: { label: "No recent reports", style: "bg-muted text-muted-foreground" },
};

function reason(s: StreetStatus): string {
  const what = s.type === "water_on" ? "water is here" : "no water";
  if (s.status === "confirmed") return `${s.reports} reports, at least 2 of 3 say ${what}.`;
  if (s.status === "suspect") return `One report says ${what}, while both neighbouring streets report the opposite. Worth a check before acting. It is context, not proof that the report is wrong.`;
  if (s.status === "unconfirmed") return s.reports === 1 ? `One report says ${what}. One report is not enough to confirm an outage.` : `${s.reports} reports that do not agree enough (under 2 of 3). Mostly ${what}.`;
  return "Nobody reported in the last 3 h. That is unknown, not dry and not wet.";
}

export function Review({ data, name }: { data: OpsData; name: (id: number) => string }) {
  const [all, setAll] = useState(false);
  const rows = [...data.statuses].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const shown = all ? rows : rows.filter((s) => s.status === "suspect" || s.status === "unconfirmed");

  return (
    <section className="surface flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Report review <span className="text-muted-foreground">(last 3 h)</span></h2>
        <div role="group" aria-label="Show" className="flex gap-1">
          <button type="button" className={`chip border ${!all ? "bg-primary text-primary-foreground" : ""}`} aria-pressed={!all} onClick={() => setAll(false)}>Needs review</button>
          <button type="button" className={`chip border ${all ? "bg-primary text-primary-foreground" : ""}`} aria-pressed={all} onClick={() => setAll(true)}>All streets</button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Raw reports are kept as they came in. Confirmed needs 2+ reports with at least 2 of 3 agreeing. Reports are counted per street, so one person reporting twice still counts twice.
      </p>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs review right now.</p>}
      <ul className="grid gap-2 md:grid-cols-2">
        {shown.map((s) => (
          <li key={s.street_id} className={`flex flex-col gap-1 rounded-2xl border p-3 text-sm ${s.status === "suspect" ? "border-amber-300 bg-amber-50" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{name(s.street_id)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[s.status].style}`}>{BADGE[s.status].label}</span>
            </div>
            <p className="text-muted-foreground">{reason(s)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

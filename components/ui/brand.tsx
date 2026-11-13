// Brand pieces shared by the landing, sign-in and the app shell: logo, the blue wave decoration,
// the page header of app screens, and which role this browser chose on /login.
import Link from "next/link";
import { Droplet } from "lucide-react";
import { cn } from "cn";
import { LangSwitch } from "@/components/ui/i18n";

export type Role = "resident" | "driver" | "ops";
export const ROLE_LABEL: Record<Role, string> = { resident: "Resident", driver: "Tanker driver", ops: "CWA operations" };
const ROLE_KEY = "kotdelo.role"; // a screen choice only: the real permission is P3's server session

export function readRole(): Role | null {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return r === "resident" || r === "driver" || r === "ops" ? r : null;
  } catch {
    return null;
  }
}
export function saveRole(r: Role) {
  try { localStorage.setItem(ROLE_KEY, r); } catch { /* private mode: the shell falls back to the page's role */ }
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-card", className)}>
      <Droplet aria-hidden className="size-5" fill="currentColor" />
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-lg font-bold tracking-[-0.02em]", className)}>
      <LogoMark />
      Kot Delo?
    </span>
  );
}

/** Decoration only: soft vertical waves for a wave-panel (sidebar, sign-in). */
export function SideWaves() {
  return (
    <svg aria-hidden viewBox="0 0 240 800" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
      <path d="M0 0H150C95 130 205 230 125 370S45 610 160 800H0Z" fill="white" fillOpacity="0.09" />
      <path d="M0 250C90 300 25 430 95 530S70 710 0 800Z" fill="white" fillOpacity="0.08" />
      <path d="M240 0V800H205C255 650 150 560 212 420S172 150 240 0Z" fill="black" fillOpacity="0.08" />
    </svg>
  );
}

/** Decoration only: three horizontal waves along the bottom of a card or band, flowing at different
 *  speeds. Each path is two seamless 400-unit periods wide and slides one period (transform only). */
export function BottomWaves({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 80" preserveAspectRatio="none" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full overflow-hidden", className)}>
      <path d="M0 38C60 16 140 16 200 38S340 60 400 38S540 16 600 38S740 60 800 38V80H0Z" fill="currentColor" fillOpacity="0.15" className="animate-[flow-svg_14s_linear_infinite]" />
      <path d="M0 52C70 70 130 70 200 52S330 34 400 52S530 70 600 52S730 34 800 52V80H0Z" fill="currentColor" fillOpacity="0.35" className="animate-[flow-svg_10s_linear_infinite_reverse]" />
      <path d="M0 64C60 54 140 54 200 64S340 74 400 64S540 54 600 64S740 74 800 64V80H0Z" fill="currentColor" className="animate-[flow-svg_7s_linear_infinite]" />
    </svg>
  );
}

/** Top of every app screen: the logo on phones (the sidebar shows it from 1024px), a small line and the title.
 *  `logo` replaces that home link and shows at every width (the resident screen puts its guide drop there). */
export function PageHeader({ eyebrow, title, logo, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; logo?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {logo ?? (
          <Link href="/" aria-label="Kot Delo? home" className="lg:hidden">
            <LogoMark className="size-11 rounded-2xl" />
          </Link>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="truncate text-sm text-muted-foreground">{eyebrow}</p>}
          <h1 className="truncate text-2xl leading-tight font-bold tracking-[-0.02em] lg:text-[1.75rem]">{title}</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <LangSwitch />
      </div>
    </header>
  );
}

"use client";

// App shell for every screen except the landing (/) and sign-in (/login), rendered once in app/layout.tsx.
// One nav per role: resident, tanker driver, CWA operations. The role comes from the screen
// (/resident, /driver) or what this browser chose on /login (an ops user keeps the ops nav everywhere).
// From 1024px: a blue wave sidebar on the left. Phones: a floating glass tab bar at the bottom.
// It sits above Leaflet maps (their panes go up to z-index 1000).
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";
import { BookOpen, Database, CalendarClock, GlassWater, Info, LayoutDashboard, LayoutGrid, LogIn, LogOut, Map, Megaphone, Newspaper, Route, Truck, Waves, type LucideIcon } from "lucide-react";
import { Logo, ROLE_LABEL, SideWaves, readRole, type Role } from "@/components/ui/brand";
import { logOut, useUser } from "@/components/home/shared";

type Item = { href: string; label: string; short: string; Icon: LucideIcon; wideOnly?: boolean };
// Spotlight tour anchor for a nav link (the tour picks whichever copy, sidebar or tab bar, is visible).
const tourId = (href: string) => `nav-${href.split("?tab=")[1] ?? href.slice(1)}`;

const NAV: Record<Role, Item[]> = {
  resident: [
    { href: "/resident", label: "Overview", short: "Home", Icon: LayoutGrid },
    { href: "/resident?tab=drink", label: "Is my tap water safe?", short: "Drink", Icon: GlassWater },
    { href: "/resident?tab=schedule", label: "Water schedule", short: "Schedule", Icon: CalendarClock },
    { href: "/resident?tab=report", label: "Report water", short: "Report", Icon: Megaphone },
    { href: "/resident?tab=request", label: "Request a tanker", short: "Tanker", Icon: Truck },
    { href: "/map", label: "Live tanker map", short: "Map", Icon: Map, wideOnly: true }, // phones: from the Tanker tab
    { href: "/resident?tab=news", label: "CWA notices", short: "Notices", Icon: Newspaper, wideOnly: true }, // phones: "All notices" on the Overview
    { href: "/resident?tab=reservoirs", label: "Reservoirs", short: "Reservoirs", Icon: Waves, wideOnly: true }, // phones: from the Overview card
    { href: "/guide", label: "How to use", short: "Guide", Icon: BookOpen, wideOnly: true }, // phones: the drop in the header
  ],
  driver: [
    { href: "/driver", label: "My round", short: "Round", Icon: Route },
    { href: "/map", label: "Live map", short: "Map", Icon: Map },
    { href: "/guide", label: "How to use", short: "Guide", Icon: BookOpen },
  ],
  ops: [
    { href: "/ops", label: "Operations", short: "Ops", Icon: LayoutDashboard },
    { href: "/map", label: "Live map", short: "Map", Icon: Map },
    { href: "/guide", label: "How to use", short: "Guide", Icon: BookOpen },
  ],
};

const noSubscribe = () => () => {};
const BARE = ["/", "/login"]; // full-width pages with their own header

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const stored = useSyncExternalStore(noSubscribe, readRole, () => null);
  if (BARE.includes(path)) return <>{children}</>;
  const role: Role = stored === "ops" ? "ops" : path.startsWith("/driver") ? "driver" : path.startsWith("/resident") ? "resident" : (stored ?? "resident");
  return (
    <>
      <Suspense fallback={<Nav role={role} path={path} tab={null} />}>
        <NavWithTab role={role} path={path} />
      </Suspense>
      <div className="flex min-h-dvh flex-col pb-(--nav-h) lg:pl-(--side-w)">{children}</div>
    </>
  );
}

function NavWithTab({ role, path }: { role: Role; path: string }) {
  return <Nav role={role} path={path} tab={useSearchParams().get("tab")} />;
}

function Nav({ role, path, tab }: { role: Role; path: string; tab: string | null }) {
  const isCurrent = (href: string) => {
    const [p, q] = href.split("?tab=");
    return path === p && (q ?? "overview") === (p === "/resident" ? (tab ?? "overview") : "overview");
  };
  const phoneItems = NAV[role].filter((i) => !i.wideOnly);
  const user = useUser();
  return (
    <>
      {/* From 1024px: the blue sidebar. */}
      <aside aria-label="Main" className="wave-panel fixed inset-y-0 left-0 z-[1100] hidden w-(--side-w) flex-col overflow-hidden lg:flex">
        <SideWaves />
        <Link href="/" className="relative px-6 pt-7">
          <Logo />
        </Link>
        <p className="relative mt-9 px-7 text-xs font-semibold tracking-[0.08em] text-white/70 uppercase">{ROLE_LABEL[role]}</p>
        <ul className="relative mt-3 flex flex-col gap-1 px-3">
          {NAV[role].map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                data-tour={tourId(href)}
                aria-current={isCurrent(href) ? "page" : undefined}
                className="group flex h-12 items-center gap-3 rounded-2xl px-3 text-[0.9375rem] font-medium text-white/90 transition-[background-color,color] duration-150 ease-snap hover:bg-white/12 aria-[current=page]:bg-white aria-[current=page]:font-semibold aria-[current=page]:text-primary aria-[current=page]:shadow-card"
              >
                <span className="grid size-8 place-items-center rounded-xl bg-white/15 group-aria-[current=page]:bg-primary group-aria-[current=page]:text-white">
                  <Icon aria-hidden className="size-4" />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="relative mx-4 mt-auto mb-5 rounded-2xl bg-white/12 p-4 text-sm">
          <p className="text-white/75">Viewing as</p>
          <p className="font-semibold">{ROLE_LABEL[role]}{role === "resident" && user ? " · Signed in" : ""}</p>
          <div className="mt-3 flex flex-col gap-1">
            {role === "resident" && user === null && (
              <Link href="/login?mode=login" className="flex min-h-9 items-center gap-2 font-medium text-white underline-offset-2 hover:underline">
                <LogIn aria-hidden className="size-4" /> Log in or sign up
              </Link>
            )}
            <button type="button" onClick={logOut} className="flex min-h-9 items-center gap-2 text-left font-medium text-white underline-offset-2 hover:underline">
              <LogOut aria-hidden className="size-4" /> Log out
            </button>
            <Link href="/" className="flex min-h-9 items-center gap-2 font-medium text-white underline-offset-2 hover:underline">
              <Info aria-hidden className="size-4" /> About Kot Delo?
            </Link>
            <Link href="/sources" className="flex min-h-9 items-center gap-2 font-medium text-white underline-offset-2 hover:underline">
              <Database aria-hidden className="size-4" /> Data sources
            </Link>
          </div>
        </div>
      </aside>

      {/* Phones: floating glass tab bar. */}
      <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <ul className="glass pointer-events-auto mx-auto flex h-16 max-w-md items-center gap-0.5 rounded-full p-1.5 shadow-nav">
          {phoneItems.map(({ href, short, Icon }) => (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                data-tour={tourId(href)}
                aria-current={isCurrent(href) ? "page" : undefined}
                className="flex h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] leading-none font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-snap aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                <Icon aria-hidden className="size-5" />
                <span className="max-w-full truncate px-0.5">{short}</span>
              </Link>
            </li>
          ))}
          {role !== "resident" && (
            <li className="min-w-0 flex-1">
              <button type="button" onClick={logOut} className="flex h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] leading-none font-medium text-muted-foreground">
                <LogOut aria-hidden className="size-5" />
                <span className="max-w-full truncate px-0.5">Log out</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}

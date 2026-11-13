"use client";

// Shared nav for every screen (rendered once in app/layout.tsx).
// Phones: a floating rounded tab bar at the bottom. From 1024px: a top bar with the name on the left.
// It sits above Leaflet maps (their panes go up to z-index 1000).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Droplets, House, LayoutDashboard, Map } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", Icon: House },
  { href: "/resident", label: "Resident", Icon: Droplets },
  { href: "/map", label: "Map", Icon: Map },
  { href: "/ops", label: "Operations", Icon: LayoutDashboard },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pointer-events-auto lg:sticky lg:top-0 lg:bottom-auto lg:h-(--nav-h) lg:px-6 lg:pb-0 lg:shadow-card lg:glass"
    >
      <div className="lg:mx-auto lg:flex lg:h-full lg:max-w-6xl lg:items-center lg:justify-between">
        <Link href="/" className="hidden text-xl font-bold tracking-[-0.02em] lg:block">Kot Delo?</Link>
        <ul className="pointer-events-auto mx-auto flex h-16 max-w-sm items-center gap-1 rounded-full p-2 shadow-nav max-lg:glass lg:mx-0 lg:h-auto lg:max-w-none lg:p-0 lg:shadow-none">
          {TABS.map(({ href, label, Icon }) => (
            <li key={href} className="min-w-0 flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}
                className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] leading-none font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-snap aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground lg:flex-row lg:gap-2 lg:px-4 lg:text-sm"
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

// Resident screen. Server part: reads the public reservoir and news data at build time; the screen is components/home/Resident.tsx.
import { Suspense } from "react";
import { Resident } from "@/components/home/Resident";
import { publicData } from "@/components/home/public-data";
import { Skeleton } from "@/components/home/shared";

export default function ResidentPage() {
  // Suspense: the section comes from ?tab= in the URL, which only the browser knows on a static page.
  // The fallback is what a slow phone sees before the JavaScript runs.
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md px-4 pt-5 md:max-w-3xl lg:max-w-7xl lg:px-8 lg:pt-8">
          <Skeleton className="h-11 w-56" />
          <div className="surface mt-7 p-5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-4 h-12 w-full" />
          </div>
        </main>
      }
    >
      <Resident info={publicData()} />
    </Suspense>
  );
}

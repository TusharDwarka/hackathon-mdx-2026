// Resident screen. Server part: reads the public reservoir and news data at build time; the screen is components/home/Resident.tsx.
import { Suspense } from "react";
import { Resident } from "@/components/home/Resident";
import { publicData } from "@/components/home/public-data";
import { Skeleton } from "@/components/home/shared";

export default function ResidentPage() {
  // Suspense: the section tab comes from ?tab= in the URL, which only the browser knows on a static page.
  // The fallback is what a slow phone sees before the JavaScript runs.
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md px-4 pt-3 lg:max-w-6xl lg:px-6 lg:pt-5">
          <div className="glass mx-auto h-[3.25rem] rounded-full shadow-card lg:max-w-xl" />
          <div className="surface mt-3 p-5">
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

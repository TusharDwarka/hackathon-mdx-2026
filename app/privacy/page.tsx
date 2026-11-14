// Privacy and terms: what Kot Delo? stores, what it never stores, and what people agree to by using it. Static page.
import Link from "next/link";
import { PageHeader } from "@/components/ui/brand";

export const metadata = { title: "Privacy and terms · Kot Delo?" };

type Block = { title: string; points: string[] };
const BLOCKS: Block[] = [
  {
    title: "What we store",
    points: [
      "Water reports, tanker requests and complaints, saved by street only.",
      "A random guest session, so one phone counts as one report. It holds no name.",
      "Your email and password, only if you create an account. The email is shown to nobody else.",
      "On this phone: your street, your language and the tips you have already seen.",
    ],
  },
  {
    title: "What we never store",
    points: [
      "No name, house number, phone number or ID card number.",
      "No free text from residents, so nobody can be named in a report.",
      "No advertising trackers. Your data is never sold or shared for marketing.",
    ],
  },
  {
    title: "Location",
    points: [
      "Residents: your location is read only when you tap the location button, to find the place nearest to you. It is not saved.",
      "Tanker drivers: the position of the tanker is shared on the live map during a round, and stops when the round ends.",
    ],
  },
  {
    title: "Your choices",
    points: [
      "You can browse the timetable, the reservoirs and the map without an account.",
      "Log out at any time. Clearing this site's data in your browser removes what is kept on this phone.",
    ],
  },
  {
    title: "Terms of use",
    points: [
      "Kot Delo? is a student project built at MDX Hackathon 2026. It is not an official CWA service.",
      "Timetables and notices come from public CWA sources and can change without warning. For anything urgent, call the CWA hotline on 170.",
      "The drinking water page is general information, not medical advice.",
      "Report only what you see at your own tap. False reports hide real water cuts from your neighbours.",
      "Tanker requests are passed on as requests. A tanker is not guaranteed.",
      "The app is provided as it is, with no guarantee that it is always available or correct.",
    ],
  },
];

export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5 pb-10">
      <PageHeader eyebrow="Stored by street, never by person" title="Privacy and terms" />
      <p className="mt-3 text-sm text-muted-foreground">By using Kot Delo? you agree to what is written on this page. Last updated 14 Nov 2026.</p>
      <ul className="mt-6 flex flex-col gap-3">
        {BLOCKS.map((b) => (
          <li key={b.title} className="surface flex flex-col gap-2 p-5">
            <h2 className="font-semibold">{b.title}</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
              {b.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">
        Where the data comes from: <Link href="/sources" className="font-semibold text-primary underline underline-offset-2">Data sources</Link>
      </p>
    </main>
  );
}

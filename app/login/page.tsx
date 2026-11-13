// Sign-in: choose resident (guest), tanker driver or CWA staff. The screen is components/home/Login.tsx.
// The static page shows the resident form at once; ?role=driver|ops (the landing's "Staff sign-in")
// is read on request and swaps in that form.
import { Suspense } from "react";
import { Login } from "@/components/home/Login";

export const metadata = { title: "Sign in · Kot Delo?" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<Login asked="resident" />}>
      <AskedRole searchParams={searchParams} />
    </Suspense>
  );
}

async function AskedRole({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { role, next, mode } = await searchParams;
  return (
    <Login
      asked={role === "driver" || role === "ops" ? role : "resident"}
      next={typeof next === "string" ? next : undefined}
      mode={mode === "signup" || mode === "login" ? mode : undefined}
    />
  );
}

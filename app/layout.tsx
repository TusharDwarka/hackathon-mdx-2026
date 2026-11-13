import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNav } from "@/components/ui/app-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kot Delo?",
  description: "Water rationing: when will water really come, and where is the tanker?",
};

export const viewport: Viewport = { themeColor: "#c3def5" }; // top of the sky gradient, so the phone's browser bar matches

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Shared nav: floating tab bar on phones, top bar from 1024px. Pages only fill the space that is left. */}
        <AppNav />
        <div className="flex flex-1 flex-col pb-(--nav-h) lg:pb-0">{children}</div>
      </body>
    </html>
  );
}

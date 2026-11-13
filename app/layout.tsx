import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/ui/app-nav";
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
      <body className="min-h-full">
        {/* App screens get the role sidebar (1024px+) or the phone tab bar; / and /login are full width. */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import Link from "next/link";
import { DemoProvider } from "@/components/DemoContext";
import { BRAND } from "@/lib/brand";
import { isDemo } from "@/lib/server";
import "./globals.css";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const DESCRIPTION = "Everyone taps one link and adds their taste. You get three picks nobody has seen, on services you actually have, that real viewers liked.";

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  // Link previews need absolute image URLs (NEXT_PUBLIC_SITE_URL, SITE_URL, then Vercel's production URL).
  metadataBase: new URL(BRAND.siteUrl),
  openGraph: { siteName: BRAND.name, title: `${BRAND.name}: ${BRAND.tagline}`, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary", title: `${BRAND.name}: ${BRAND.tagline}`, description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#0b0a09", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = await isDemo();
  return (
    <html lang="en" className={`${barlow.variable} ${inter.variable}`}>
      <body>
        <DemoProvider demo={demo}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--bg-2)] focus:px-3 focus:py-2">
            Skip to content
          </a>
          <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur">
            <nav className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4" aria-label="Main">
              <Link href="/" className="font-display whitespace-nowrap text-xl font-bold uppercase tracking-wide text-accent">
                {BRAND.name}
              </Link>
              <div className="ml-auto flex items-center gap-0.5 whitespace-nowrap text-sm">
                <Link href="/pair" className="rounded-full px-2.5 py-1.5 hover:bg-[var(--bg-3)]">
                  Together
                </Link>
                <Link href="/pick" className="rounded-full px-2.5 py-1.5 hover:bg-[var(--bg-3)]">
                  Just me
                </Link>
                <Link href="/me" className="rounded-full px-2.5 py-1.5 hover:bg-[var(--bg-3)]">
                  Profile
                </Link>
                <Link href="/alexa" className="hidden rounded-full px-3 py-1.5 hover:bg-[var(--bg-3)] sm:inline">
                  Voice
                </Link>
              </div>
            </nav>
          </header>
          {demo && (
            <div className="bg-[var(--bg-3)] px-4 py-1 text-center text-xs text-dim" role="status">
              Demo mode: posters are replaced by title cards. <a className="underline" href="?demo=0">Turn off</a>
            </div>
          )}
          <main id="main" className="mx-auto max-w-5xl px-4 pb-24 pt-6">
            {children}
          </main>
          <Footer />
        </DemoProvider>
        {/* Vercel Web Analytics: visitor and page-view counts, no cookies */}
        <Analytics />
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line px-4 py-8 text-xs text-faint">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/how-it-works" className="hover:underline">How it works</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/alexa" className="hover:underline">Ask by voice</Link>
          <a href="https://github.com/gunnerhowe/TodaysWatch" className="hover:underline" rel="noopener noreferrer" target="_blank">
            Source (MIT)
          </a>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* TMDB attribution, as their API terms require: official logo (themoviedb.org/about/logos-attribution) and notice */}
          <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="shrink-0" aria-label="The Movie Database (TMDB)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tmdb-logo.svg" alt="TMDB" width={92} height={12} className="h-3 w-auto" />
          </a>
          <p>
            This product uses the TMDB API but is not endorsed or certified by TMDB. Where-to-watch data provided by{" "}
            <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer" className="underline">
              JustWatch
            </a>
            .
          </p>
        </div>
        <p>Scores come from public comments collected through official APIs (YouTube, Bluesky, TMDB reviews, and Reddit or Trakt when enabled), plus thumbs from {BRAND.name} users. Taste matching by Qloo. Classification by NVIDIA Nemotron on Nebius.</p>
      </div>
    </footer>
  );
}

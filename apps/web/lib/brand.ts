/**
 * The brand in one place, so the hackathon deploy (Tonight's Pick) and the Couch Truce deploy
 * run the same code. NEXT_PUBLIC_ values are inlined at build time, so this works in client
 * components too. "Tonight's Pick" stays the name of the solo pick either way.
 */

const trimUrl = (u: string) => u.trim().replace(/\/+$/, "");

export interface Brand {
  name: string;
  tagline: string;
  /** absolute origin, no trailing slash */
  siteUrl: string;
  /** siteUrl without the scheme, for printing on cards */
  host: string;
  /** what the solo pick is called */
  soloName: string;
}

export function brandFrom(env: Record<string, string | undefined>): Brand {
  const name = env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Couch Truce";
  const siteUrl = trimUrl(
    env.NEXT_PUBLIC_SITE_URL || env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "") || "http://localhost:3000",
  );
  return {
    name,
    tagline: env.NEXT_PUBLIC_BRAND_TAGLINE?.trim() || "Movie night, minus the argument.",
    siteUrl,
    host: siteUrl.replace(/^https?:\/\//, ""),
    soloName: "Tonight's Pick",
  };
}

// Spelled out so Next.js inlines each NEXT_PUBLIC_ value into client bundles.
export const BRAND: Brand = brandFrom({
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
  NEXT_PUBLIC_BRAND_TAGLINE: process.env.NEXT_PUBLIC_BRAND_TAGLINE,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  SITE_URL: process.env.SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});

/** "couch-truce" from "Couch Truce", for file names. */
export const brandSlug = (name = BRAND.name) =>
  name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

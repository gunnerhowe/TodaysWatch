import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@tp/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }] },
  poweredByHeader: false,
};

export default config;

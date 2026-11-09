import type { NextConfig } from "next";

// cacheComponents (Partial Prerendering) is deliberately OFF. Every page in this app is
// per-user and must redirect server-side (real 307s, no flicker) before rendering, and the
// spec pins route handlers to `runtime = "nodejs"`, which cacheComponents forbids.
const nextConfig: NextConfig = {
  // Hide the dev-only "N" badge (keeps demo recordings clean). Errors still show.
  devIndicators: false,
  // Google profile photos, rendered with next/image on the dashboard.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  turbopack: {
    // Pin the workspace root so a stray lockfile in a parent directory isn't picked up.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

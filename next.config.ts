import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
// Only inject the Cloudflare proxy when running `next dev`. During `next build`
// (and CI typecheck) the container binding requires a build_id that doesn't
// exist yet, so we skip it.
if (process.env.NODE_ENV === "development" && process.env.NEXT_PHASE !== "phase-production-build") {
  initOpenNextCloudflareForDev().catch((err) => {
    console.warn("[next.config] initOpenNextCloudflareForDev skipped:", err?.message ?? err);
  });
}

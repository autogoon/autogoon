import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add hosts here to reach the dev server from
  // another device on your network (HMR etc.).
  allowedDevOrigins: [],

  // Build stamp, so the running app can show what's live (see the Info card in
  // Settings). On Vercel the VERCEL_GIT_* vars are injected automatically;
  // locally they're absent and fall back to "dev". Vercel has no build-time env
  // var, so we make one here — this file is evaluated at build time, freezing
  // the value into the bundle.
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    NEXT_PUBLIC_GIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? "dev",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;

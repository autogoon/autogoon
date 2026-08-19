import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Reach the dev server from another device on your network (HMR etc.):
  // Next blocks cross-origin dev asset requests unless the origin is listed,
  // and its wildcards can't span an IP's trailing octets. The literal
  // origin comes from the gitignored .env (see .env.example), keeping
  // machine-specific config out of the repo.
  allowedDevOrigins:
    process.env.DEV_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) ?? [],

  // Build stamp. The running app shows what's live (see the Info card in
  // Settings). On Vercel the VERCEL_GIT_* vars are injected automatically;
  // locally they're absent and fall back to "dev". Vercel has no build-time env
  // var. This file makes one and is evaluated at build time, freezing
  // the value into the bundle.
  images: {
    // next/image refuses a local src carrying a query string unless it is
    // listed here. The first entry is Next's own default, restated because
    // naming any pattern replaces it; the second admits the inference corpus,
    // which names its file in the query (src/app/api/inference/media/route.ts).
    localPatterns: [
      { pathname: '**', search: '' },
      { pathname: '/api/inference/media' },
    ],
  },

  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    NEXT_PUBLIC_GIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? 'dev',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    // The changelog rides along the same way: frozen into the bundle at build
    // time, rendered by the Changelog screen (src/lib/changelog.ts parses it).
    NEXT_PUBLIC_CHANGELOG: readFileSync(
      join(process.cwd(), 'CHANGELOG.md'),
      'utf8',
    ),
  },
};

export default nextConfig;

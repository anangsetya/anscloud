import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel builds don't need standalone output — Vercel handles deployment natively.
  // Standalone is kept only for Docker/Fly.io deploys; Vercel ignores this anyway.
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // These packages use Node.js modules (child_process, fs) that don't
  // belong in the browser bundle. Vercel handles them server-side only.
  serverExternalPackages: [
    "googleapis",
    "google-auth-library",
    "gcp-metadata",
    "bcryptjs",
    "archiver",
    "@supabase/supabase-js",
  ],
  // Vercel-specific: max body size for API routes (default 4.5MB on free tier).
  // For larger uploads, use the chunked upload API (/api/upload/chunk/*).
  experimental: {
    // Optimize Prisma client loading
    optimizePackageImports: ["@prisma/client", "lucide-react"],
  },
};

export default nextConfig;

/**
 * Next.js config. Imports env to validate environment variables at build time.
 */

import type { NextConfig } from "next";

import "@packages/env/nextjs-client";

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default nextConfig;

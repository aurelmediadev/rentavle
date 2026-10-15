import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the dev badge away from the sidebar's user menu (bottom-left).
  devIndicators: { position: "bottom-right" },
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@rentavle/db", "@rentavle/domain", "@rentavle/country", "@rentavle/jobs", "@rentavle/pdf", "@rentavle/emails"],
  // postgres-js must run in Node, not be bundled.
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

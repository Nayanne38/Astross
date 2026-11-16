import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages build: GH_PAGES=1 -> static export under /Astross (see .github/workflows/pages.yml)
  ...(process.env.GH_PAGES === "1"
    ? { output: "export" as const, basePath: "/Astross", trailingSlash: true, images: { unoptimized: true } }
    : { output: "standalone" as const }),
  ...(process.env.GH_PAGES === "1" ? {} : { cacheComponents: true, partialPrefetching: true }),
  turbopack: {
    root: path.resolve(process.cwd()),
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};

export default nextConfig;

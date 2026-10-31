import type { NextConfig } from "next";

// Server-side proxy: the browser only ever talks to this Next.js origin.
// BACKEND_URL points at the FastAPI service (e.g. http://139.59.32.209:8000).
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
};

export default nextConfig;

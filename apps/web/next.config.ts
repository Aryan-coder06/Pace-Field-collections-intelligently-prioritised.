import type { NextConfig } from "next";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd(), "../..");
const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL;
    return api ? [{ source: "/api/:path*", destination: `${api}/:path*` }] : [];
  },
};
export default config;

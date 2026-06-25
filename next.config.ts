import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["docxtemplater", "pizzip"],
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/discovery",
      },
    ];
  },
};

export default nextConfig;

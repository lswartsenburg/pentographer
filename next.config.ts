import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["docxtemplater", "pizzip"],
};

export default nextConfig;

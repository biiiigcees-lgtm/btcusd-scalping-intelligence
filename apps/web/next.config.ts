import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@btc/shared"],
  // Monorepo: include workspace packages in file tracing
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;

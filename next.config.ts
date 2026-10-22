import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./data/snapshots/*.json.gz"],
  },
};

export default nextConfig;

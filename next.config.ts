import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/*': ['./src/generated/prisma/**/*', './prisma/**/*'],
  },
};

export default nextConfig;

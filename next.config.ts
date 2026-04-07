import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "community.akamai.steamstatic.com",
        pathname: "/economy/image/**",
      },
    ],
  },
};

export default nextConfig;

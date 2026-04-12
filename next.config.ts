import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "community.akamai.steamstatic.com",
        pathname: "/economy/image/**",
      },
      {
        protocol: "https",
        hostname: "avatars.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "avatars.akamai.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "cdn.akamai.steamstatic.com",
      },
    ],
  },
};

export default nextConfig;

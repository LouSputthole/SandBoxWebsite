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
  // /holders is the old path for what is now /whales. Permanent redirect
  // preserves any backlinks + search rankings while the crawler catches up.
  async redirects() {
    return [
      {
        source: "/holders",
        destination: "/whales",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

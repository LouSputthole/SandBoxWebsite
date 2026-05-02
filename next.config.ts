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
      // Facepunch's actual asset CDN — where sbox.dev's per-skin
      // iconUrl points (e.g. cdn.sbox.game/asset/<hash>.png and
      // /upload/i/<uuid>/<hash>.png). Every store-discovered item
      // gets its image from here, so without this entry next/image
      // silently refuses to render and items show as broken thumbs.
      {
        protocol: "https",
        hostname: "cdn.sbox.game",
      },
      // sbox.dev's Cloudflare image-resize wrapper. We try to unwrap
      // these to bare cdn.sbox.game URLs in pickSboxImage(), but
      // allowlist this too in case any old DB rows still hold the
      // wrapped form.
      {
        protocol: "https",
        hostname: "sbox.dev",
        pathname: "/cdn-cgi/image/**",
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

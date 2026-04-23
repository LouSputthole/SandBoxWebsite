import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Providers } from "@/components/providers";
import { PageTracker } from "@/components/analytics/page-tracker";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default:
      "sboxskins.gg — S&box Skin Market Tracker | Prices, Trends & Order Books",
    template: "%s | sboxskins.gg",
  },
  // Use "S&box" for the first (canonical) reference and "sbox" for the
  // secondary one — Google treats them as related but distinct tokens, so
  // including both in the meta description lifts ranking on the bare-word
  // "sbox skins" query (which is what most people actually type on mobile)
  // without diluting the "s&box skins" signal we already have.
  description:
    "The dedicated S&box cosmetics market tracker. Live prices, real-time order books, 24h/7d changes, total supply counts, and historical charts for every sbox skin on the Steam Community Market. Updated every 15–30 minutes.",
  metadataBase: new URL("https://sboxskins.gg"),
  keywords: [
    // Core product — "skins" and "cosmetics" both hit
    "sbox skins", "s&box skins", "sandbox skins", "s box skins",
    "sbox cosmetics", "s&box cosmetics", "sandbox cosmetics", "s&box cosmetics market",
    // Market / marketplace variants
    "sbox market", "s&box market", "sbox marketplace", "s&box marketplace",
    "sbox cosmetics market", "sbox skin market", "s&box skin market",
    "sbox steam market", "s&box steam market",
    // Price + tracker
    "sbox skin prices", "s&box skin prices", "sbox cosmetics prices",
    "s&box price tracker", "sbox market tracker", "sbox cosmetics tracker",
    // Trading / flipping
    "sbox trading", "s&box trading", "sbox skin trading",
    // Bare-word sbox long-tails (users frequently drop the ampersand
    // on mobile where & is a keyboard-shift)
    "sbox game skins", "sbox game market", "sbox game cosmetics",
    "sbox skin tracker", "sbox price history", "sbox skin prices today",
    // Misc discovery
    "steam market sbox", "facepunch sbox", "sandbox game skins",
    "sbox order book", "sbox skin supply", "sboxskins", "sbox charts",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "sboxskins.gg",
    title: "sboxskins.gg — S&box Skin Market Tracker",
    description:
      "Live S&box cosmetics market data — prices, order books, supply, and trends from the Steam Community Market. The go-to tracker for every sbox skin.",
    type: "website",
    url: "https://sboxskins.gg",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "sboxskins.gg — S&box Skin Market Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "sboxskins.gg — S&box Skin Market Tracker",
    description:
      "Live S&box cosmetics market data — prices, order books, supply, and trends. The go-to sbox skin market tracker.",
    images: ["/opengraph-image"],
    site: "@SboxSkinsgg",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "sboxskins.gg",
    // Alternate names feed Google's "also known as" SERP layout and
    // help match bare-word "sbox" queries without rewriting our primary
    // S&box-first body copy.
    alternateName: ["sbox skins", "S&box Skins", "sbox market tracker"],
    url: "https://sboxskins.gg",
    description:
      "Browse, search, and track prices for S&box (also written sbox) cosmetics and skins on the Steam Community Market. Live sbox market data, order books, supply counts, and historical charts.",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://sboxskins.gg/items?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#0a0a0f] text-neutral-100 font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
        <Suspense fallback={null}>
          <PageTracker />
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

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
    default: "sboxskins.gg — S&box Skin Prices, Market Trends & Order Books",
    template: "%s | sboxskins.gg",
  },
  description:
    "The dedicated S&box skin price tracker. Live prices, real-time order books, 24h changes, total supply counts, and historical charts for every S&box skin on the Steam Community Market. Updated every 15–30 minutes.",
  metadataBase: new URL("https://sboxskins.gg"),
  keywords: [
    "sbox skins", "s&box skins", "sandbox skins", "s box skins",
    "sbox marketplace", "s&box marketplace", "sbox skin prices",
    "s&box price tracker", "sbox trading", "steam market sbox",
    "facepunch sbox", "sbox cosmetics", "sandbox game skins",
    "sbox order book", "sbox skin supply", "sbox market tracker",
    "s&box steam market", "sboxskins",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "sboxskins.gg",
    title: "sboxskins.gg — S&box Skin Prices & Market Tracker",
    description:
      "Live S&box skin prices, order books, supply data, and market trends from the Steam Community Market. Track every S&box skin in one place.",
    type: "website",
    url: "https://sboxskins.gg",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "sboxskins.gg — S&box Skin Prices & Market Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "sboxskins.gg — S&box Skin Prices & Market Tracker",
    description:
      "Live S&box skin prices, order books, supply data, and market trends. Track every S&box skin on the Steam Community Market.",
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
    url: "https://sboxskins.gg",
    description: "Browse, search, and track prices for S&box (sbox/sandbox) skins on the Steam Community Market.",
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

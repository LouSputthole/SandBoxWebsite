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
    default: "sboxskins.gg - S&box Marketplace & Price Tracker",
    template: "%s | sboxskins.gg",
  },
  description:
    "Browse, search, and track prices for S&box (sbox/sandbox) skins on the Steam Community Market. View price history, trends, and find the best deals on sbox skins.",
  metadataBase: new URL("https://sboxskins.gg"),
  keywords: [
    "sbox skins", "s&box skins", "sandbox skins", "s box skins",
    "sbox marketplace", "s&box marketplace", "sbox skin prices",
    "s&box price tracker", "sbox trading", "steam market sbox",
    "facepunch sbox", "sbox cosmetics", "sandbox game skins",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "sboxskins.gg",
    type: "website",
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

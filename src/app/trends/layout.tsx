import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Trends & Analytics - S&box Skins",
  description:
    "Track S&box skin market trends, price movements, and top gainers/losers. View market cap, average price, volume, and type breakdown charts across 7, 30, or 90 day windows.",
  alternates: { canonical: "/trends" },
  openGraph: {
    title: "S&box Market Trends & Analytics",
    description:
      "Live charts, top movers, and market-wide analytics for every S&box skin on the Steam Community Market.",
    type: "website",
    url: "https://sboxskins.gg/trends",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
    { "@type": "ListItem", position: 2, name: "Trends", item: "https://sboxskins.gg/trends" },
  ],
};

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {children}
    </>
  );
}

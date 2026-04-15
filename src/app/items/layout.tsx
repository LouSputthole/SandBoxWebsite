import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse All S&box Skins — Prices, Supply & Market Data",
  description:
    "Search and browse every S&box skin on the Steam Community Market. Compare prices, supply counts, order books, and 24h trends. Filter by type, price range, and popularity.",
  alternates: { canonical: "/items" },
  openGraph: {
    title: "Browse All S&box Skins — Live Market Prices",
    description:
      "Every S&box skin on Steam with live prices, 24h changes, supply data, and order books. Find deals, track rare items, and watch the market.",
    type: "website",
    url: "https://sboxskins.gg/items",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
    { "@type": "ListItem", position: 2, name: "Browse Skins", item: "https://sboxskins.gg/items" },
  ],
};

export default function ItemsLayout({ children }: { children: React.ReactNode }) {
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

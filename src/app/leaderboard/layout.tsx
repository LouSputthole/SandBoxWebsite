import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top S&box Skins Leaderboard - Most Valuable, Gainers, Losers",
  description:
    "See the most valuable S&box skins, biggest 24h price gainers and losers, and most-listed items on the Steam Community Market. Updated every 15 minutes.",
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "S&box Skins Leaderboard — Top Items, Gainers, Losers",
    description:
      "Rankings of the most valuable, top gaining, and most traded S&box skins. Live market data from Steam.",
    type: "website",
    url: "https://sboxskins.gg/leaderboard",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
    { "@type": "ListItem", position: 2, name: "Leaderboard", item: "https://sboxskins.gg/leaderboard" },
  ],
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
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

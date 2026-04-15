import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your S&box Skins Watchlist & Portfolio",
  description:
    "Track your favorite S&box skins in one place. See portfolio value, price changes, and market movements. Sign in with Steam to sync across devices.",
  alternates: { canonical: "/portfolio" },
  openGraph: {
    title: "S&box Skin Watchlist & Portfolio Tracker",
    description: "Track the S&box skins you care about and monitor their market value over time.",
    type: "website",
    url: "https://sboxskins.gg/portfolio",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
    { "@type": "ListItem", position: 2, name: "Portfolio", item: "https://sboxskins.gg/portfolio" },
  ],
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
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

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "S&box Inventory Value Checker — Estimate Your Skins' Worth",
  description:
    "Check the total market value of any Steam user's public S&box inventory. Enter a Steam ID or vanity URL to see the estimated value of their skins at current market prices.",
  alternates: { canonical: "/inventory" },
  openGraph: {
    title: "S&box Inventory Value Checker",
    description:
      "Calculate the total market value of any public S&box inventory using live Steam Market prices.",
    type: "website",
    url: "https://sboxskins.gg/inventory",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
    { "@type": "ListItem", position: 2, name: "Inventory Checker", item: "https://sboxskins.gg/inventory" },
  ],
};

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
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

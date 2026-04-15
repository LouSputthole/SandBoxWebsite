import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ItemDetail } from "@/components/items/item-detail";
import { ItemCard } from "@/components/items/item-card";
import { formatPrice } from "@/lib/utils";

// ISR — regenerate each item page every 5 minutes. Sync runs every 15-30 min,
// so 5-min cache is always fresh relative to actual data updates. Googlebot
// + users see cached HTML → faster loads, lower DB + function cost.
//
// (Previously used force-dynamic hoping to produce real 404s for missing
// items, but that's a Next.js streaming limitation we can't fix at this layer.
// The noindex meta tag from not-found.tsx is what keeps Google from indexing
// fake slugs — it works identically with or without dynamic rendering.)
export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

// React cache() de-dupes within a single request — generateMetadata and the
// page component both call getItem(slug), but only one DB query fires.
const getItem = cache(async (slug: string) =>
  prisma.item.findFirst({
    where: {
      OR: [{ id: slug }, { slug }],
    },
    include: {
      priceHistory: {
        orderBy: { timestamp: "asc" },
      },
    },
  }),
);

async function getRelatedItems(item: { id: string; type: string }) {
  return prisma.item.findMany({
    where: {
      id: { not: item.id },
      type: item.type,
    },
    take: 6,
    orderBy: { volume: "desc" },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(slug);

  if (!item) {
    // Calling notFound() from generateMetadata tells Next.js to return a real
    // HTTP 404 (instead of a soft 200). Page component also calls notFound().
    notFound();
  }

  const price = item.currentPrice != null ? formatPrice(item.currentPrice) : "N/A";
  const description = item.description
    ? `${item.description} Currently ${price} on the Steam Community Market.`
    : `${item.name} - ${item.type} for S&box. Currently ${price} on the Steam Community Market. View price history and trends.`;

  return {
    title: `${item.name} - S&box Skins`,
    description,
    alternates: { canonical: `/items/${item.slug}` },
    openGraph: {
      title: `${item.name} (${price}) - S&box Skins`,
      description,
      type: "website",
    },
  };
}

export default async function ItemDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const item = await getItem(slug);

  if (!item) {
    notFound();
  }

  // Serialize dates for the client component
  const serialized = {
    ...item,
    delistedAt: item.delistedAt?.toISOString() ?? null,
    priceHistory: item.priceHistory.map((p) => ({
      ...p,
      timestamp: p.timestamp.toISOString(),
    })),
  };

  const relatedItems = await getRelatedItems(item);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
      { "@type": "ListItem", position: 2, name: "Items", item: "https://sboxskins.gg/items" },
      { "@type": "ListItem", position: 3, name: item.type, item: `https://sboxskins.gg/items/type/${item.type}` },
      { "@type": "ListItem", position: 4, name: item.name, item: `https://sboxskins.gg/items/${item.slug}` },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: item.description || `${item.name} - ${item.type} for S&box on the Steam Community Market.`,
    url: `https://sboxskins.gg/items/${item.slug}`,
    category: item.type,
    ...(item.imageUrl && !item.imageUrl.startsWith("/items/") ? { image: item.imageUrl } : {}),
    offers: {
      "@type": "Offer",
      price: item.currentPrice ?? 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: item.marketUrl || `https://sboxskins.gg/items/${item.slug}`,
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Type", value: item.type },
      ...(item.volume ? [{ "@type": "PropertyValue", name: "Market Volume", value: item.volume.toString() }] : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ItemDetail item={serialized} />
      {relatedItems.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-xl font-bold text-white mb-6">Similar Items</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {relatedItems.map((ri) => (
              <ItemCard key={ri.id} item={ri} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

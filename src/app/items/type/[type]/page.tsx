import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ItemCard } from "@/components/items/item-card";

const VALID_TYPES = ["character", "clothing", "accessory", "weapon", "tool"] as const;

const typeDescriptions: Record<string, { title: string; description: string }> = {
  character: {
    title: "Character Skins",
    description:
      "Browse all S&box character skins available on the Steam Community Market. Track prices, view history, and find deals on character models.",
  },
  clothing: {
    title: "Clothing Skins",
    description:
      "Browse all S&box clothing items on the Steam Community Market. Track prices, view price history, and find the best deals on clothing skins.",
  },
  accessory: {
    title: "Accessories",
    description:
      "Browse all S&box accessories on the Steam Community Market. Track accessory prices, view trends, and discover rare finds.",
  },
  weapon: {
    title: "Weapon Skins",
    description:
      "Browse all S&box weapon skins on the Steam Community Market. Compare weapon prices, track history, and find deals.",
  },
  tool: {
    title: "Tool Skins",
    description:
      "Browse all S&box tool skins on the Steam Community Market. Track tool prices, view trends, and find the best deals.",
  },
};

interface PageProps {
  params: Promise<{ type: string }>;
}

// ISR: regenerate category pages every 5 minutes. Matches the homepage —
// keeps data fresh without re-running the DB query on every request.
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params;
  const info = typeDescriptions[type];
  if (!info) return { title: "Not Found" };

  return {
    title: `${info.title} - S&box Skins`,
    description: info.description,
    alternates: { canonical: `/items/type/${type}` },
    openGraph: {
      title: `${info.title} - S&box Skins`,
      description: info.description,
    },
  };
}

export default async function TypePage({ params }: PageProps) {
  const { type } = await params;
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    notFound();
  }

  const info = typeDescriptions[type];
  // Only select what ItemCard needs — avoids shipping description, storeStatus,
  // steamMarketId, sboxFullIdent, etc. that aren't used on this page.
  const items = await prisma.item.findMany({
    where: { type },
    orderBy: { currentPrice: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      imageUrl: true,
      currentPrice: true,
      priceChange24h: true,
      volume: true,
      totalSupply: true,
      isLimited: true,
    },
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${info.title} - sboxskins.gg`,
    description: info.description,
    url: `https://sboxskins.gg/items/type/${type}`,
    isPartOf: { "@type": "WebSite", name: "sboxskins.gg", url: "https://sboxskins.gg" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
        { "@type": "ListItem", position: 2, name: "Items", item: "https://sboxskins.gg/items" },
        { "@type": "ListItem", position: 3, name: info.title, item: `https://sboxskins.gg/items/type/${type}` },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-neutral-500 mb-6" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
            <li>/</li>
            <li><Link href="/items" className="hover:text-white transition-colors">Items</Link></li>
            <li>/</li>
            <li className="text-white capitalize">{type}</li>
          </ol>
        </nav>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{info.title}</h1>
          <p className="text-sm text-neutral-400 mt-1">{info.description}</p>
          <p className="text-xs text-neutral-600 mt-2">{items.length} items found</p>
        </div>

        {items.length === 0 ? (
          <p className="text-neutral-500 text-center py-20">No {type} items found yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Internal links to other types */}
        <div className="mt-16 border-t border-neutral-800 pt-8">
          <h2 className="text-sm font-medium text-neutral-400 mb-4">Browse by Type</h2>
          <div className="flex flex-wrap gap-2">
            {VALID_TYPES.filter((t) => t !== type).map((t) => (
              <Link
                key={t}
                href={`/items/type/${t}`}
                className="px-3 py-1.5 rounded-full border border-neutral-700 text-sm text-neutral-300 hover:border-purple-500 hover:text-white transition-colors capitalize"
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

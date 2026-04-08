import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ItemCard } from "@/components/items/item-card";

const VALID_RARITIES = ["common", "uncommon", "rare", "legendary"] as const;

const rarityInfo: Record<string, { title: string; description: string; color: string }> = {
  common: {
    title: "Common Skins",
    description:
      "Browse all common-rarity S&box skins on the Steam Community Market. Track prices and find affordable common items.",
    color: "text-neutral-300",
  },
  uncommon: {
    title: "Uncommon Skins",
    description:
      "Browse all uncommon-rarity S&box skins on the Steam Community Market. Track prices and find uncommon items with good value.",
    color: "text-emerald-400",
  },
  rare: {
    title: "Rare Skins",
    description:
      "Browse all rare S&box skins on the Steam Community Market. Track prices on rare items and find the best deals.",
    color: "text-blue-400",
  },
  legendary: {
    title: "Legendary Skins",
    description:
      "Browse all legendary S&box skins on the Steam Community Market. The most sought-after items — track prices and market trends.",
    color: "text-purple-400",
  },
};

interface PageProps {
  params: Promise<{ rarity: string }>;
}

export async function generateStaticParams() {
  return VALID_RARITIES.map((rarity) => ({ rarity }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { rarity } = await params;
  const info = rarityInfo[rarity];
  if (!info) return { title: "Not Found" };

  return {
    title: `${info.title} - S&box Skins`,
    description: info.description,
    alternates: { canonical: `/items/rarity/${rarity}` },
    openGraph: {
      title: `${info.title} - S&box Skins`,
      description: info.description,
    },
  };
}

export default async function RarityPage({ params }: PageProps) {
  const { rarity } = await params;
  if (!VALID_RARITIES.includes(rarity as (typeof VALID_RARITIES)[number])) {
    notFound();
  }

  const info = rarityInfo[rarity];
  const items = await prisma.item.findMany({
    where: { rarity },
    orderBy: { currentPrice: "desc" },
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${info.title} - sboxskins.gg`,
    description: info.description,
    url: `https://sboxskins.gg/items/rarity/${rarity}`,
    isPartOf: { "@type": "WebSite", name: "sboxskins.gg", url: "https://sboxskins.gg" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
        { "@type": "ListItem", position: 2, name: "Items", item: "https://sboxskins.gg/items" },
        { "@type": "ListItem", position: 3, name: info.title, item: `https://sboxskins.gg/items/rarity/${rarity}` },
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
            <li className={`capitalize ${info.color}`}>{rarity}</li>
          </ol>
        </nav>

        <div className="mb-8">
          <h1 className={`text-2xl font-bold ${info.color}`}>{info.title}</h1>
          <p className="text-sm text-neutral-400 mt-1">{info.description}</p>
          <p className="text-xs text-neutral-600 mt-2">{items.length} items found</p>
        </div>

        {items.length === 0 ? (
          <p className="text-neutral-500 text-center py-20">No {rarity} items found yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Internal links to other rarities */}
        <div className="mt-16 border-t border-neutral-800 pt-8">
          <h2 className="text-sm font-medium text-neutral-400 mb-4">Browse by Rarity</h2>
          <div className="flex flex-wrap gap-2">
            {VALID_RARITIES.filter((r) => r !== rarity).map((r) => (
              <Link
                key={r}
                href={`/items/rarity/${r}`}
                className={`px-3 py-1.5 rounded-full border border-neutral-700 text-sm hover:border-purple-500 transition-colors capitalize ${rarityInfo[r].color}`}
              >
                {r}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ItemDetail } from "@/components/items/item-detail";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getItem(slug: string) {
  return prisma.item.findFirst({
    where: {
      OR: [{ id: slug }, { slug }],
    },
    include: {
      priceHistory: {
        orderBy: { timestamp: "desc" },
        take: 90,
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(slug);

  if (!item) {
    return { title: "Item Not Found - S&box Skins" };
  }

  const price = item.currentPrice != null ? formatPrice(item.currentPrice) : "N/A";
  const description = item.description
    ? `${item.description} Currently ${price} on the Steam Community Market.`
    : `${item.name} - ${item.rarity ?? "common"} ${item.type}. Currently ${price} on the Steam Community Market. View price history and trends.`;

  return {
    title: `${item.name} - S&box Skins`,
    description,
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
    priceHistory: item.priceHistory.map((p) => ({
      ...p,
      timestamp: p.timestamp.toISOString(),
    })),
  };

  return <ItemDetail item={serialized} />;
}

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPES = ["character", "clothing", "accessory", "weapon", "tool"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await prisma.item.findMany({
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const latestUpdate = items.length > 0 ? items[0].updatedAt : new Date();

  const itemPages: MetadataRoute.Sitemap = items.map((item) => ({
    url: `https://sboxskins.gg/items/${item.slug}`,
    lastModified: item.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const typePages: MetadataRoute.Sitemap = TYPES.map((type) => ({
    url: `https://sboxskins.gg/items/type/${type}`,
    lastModified: latestUpdate,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [
    {
      url: "https://sboxskins.gg",
      lastModified: latestUpdate,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://sboxskins.gg/items",
      lastModified: latestUpdate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: "https://sboxskins.gg/trends",
      lastModified: latestUpdate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: "https://sboxskins.gg/leaderboard",
      lastModified: latestUpdate,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://sboxskins.gg/portfolio",
      lastModified: latestUpdate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://sboxskins.gg/inventory",
      lastModified: latestUpdate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://sboxskins.gg/faq",
      lastModified: latestUpdate,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...typePages,
    ...itemPages,
  ];
}

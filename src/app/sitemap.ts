import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await prisma.item.findMany({
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const itemPages: MetadataRoute.Sitemap = items.map((item) => ({
    url: `https://sboxskins.gg/items/${item.slug}`,
    lastModified: item.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [
    {
      url: "https://sboxskins.gg",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://sboxskins.gg/items",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...itemPages,
  ];
}

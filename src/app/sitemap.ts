import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

// ISR — regenerate sitemap every hour. Item list changes slowly (new items
// added by sync), so hourly cache is plenty fresh for Googlebot.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [items, blogPosts] = await Promise.all([
    prisma.item.findMany({
      select: { slug: true, type: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.blogPost.findMany({
      select: { slug: true, publishedAt: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
    }),
  ]);

  const latestUpdate = items.length > 0 ? items[0].updatedAt : new Date();

  const blogPages: MetadataRoute.Sitemap = blogPosts.map((p) => ({
    url: `https://sboxskins.gg/blog/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const itemPages: MetadataRoute.Sitemap = items.map((item) => ({
    url: `https://sboxskins.gg/items/${item.slug}`,
    lastModified: item.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  // Only include type pages for types that actually have items — empty category
  // pages signal thin content to Google and hurt indexing.
  const typesWithItems = Array.from(new Set(items.map((i) => i.type)));
  const typePages: MetadataRoute.Sitemap = typesWithItems.map((type) => ({
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
      url: "https://sboxskins.gg/whales",
      lastModified: latestUpdate,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://sboxskins.gg/store",
      lastModified: latestUpdate,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://sboxskins.gg/compare",
      lastModified: latestUpdate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://sboxskins.gg/blog",
      lastModified: latestUpdate,
      changeFrequency: "weekly",
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
    {
      url: "https://sboxskins.gg/contact",
      lastModified: latestUpdate,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...typePages,
    ...itemPages,
    ...blogPages,
  ];
}

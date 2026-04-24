import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { cache } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { scoreAllItems } from "@/lib/market/momentum";
import { ShareSparkline } from "@/components/share/sparkline";
import { CopyLinkButton } from "@/components/share/copy-link-button";

/**
 * /s/<slug> — dedicated shareable snapshot page for one item. Short URL,
 * minimal chrome, optimized for looking good in a screenshot AND having
 * its OG image unfurl cleanly in Twitter/Discord/Reddit.
 *
 * Deliberately sparse: one screen's worth of the key numbers, our name
 * prominently embedded, a sparkline of 30d prices. No navbar, no footer
 * junk — this is a poster, not a browsing page. The full detail page is
 * one click away via the CTA.
 *
 * Why /s/ and not /share/<slug>: short URLs share better (Twitter, SMS,
 * and Discord all truncate long links visually). sboxskins.gg/s/cardboard-king
 * beats sboxskins.gg/items/cardboard-king/share by 14 characters.
 */

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getItem = cache(async (slug: string) =>
  prisma.item.findFirst({
    where: { OR: [{ id: slug }, { slug }] },
    include: {
      priceHistory: {
        orderBy: { timestamp: "asc" },
        // 30d of points is plenty for a sparkline — more is just noise
        // and slows the render.
        take: 300,
      },
    },
  }),
);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(slug);
  if (!item) return { title: "Item not found" };

  const priceLine =
    item.currentPrice != null
      ? `${formatPrice(item.currentPrice)}`
      : "price not available";
  const description = `${item.name} on sboxskins.gg — ${priceLine}${
    item.totalSupply ? ` · ${item.totalSupply.toLocaleString()} total supply` : ""
  }. Quick snapshot with price history, scarcity, and momentum.`;

  return {
    title: `${item.name} — sboxskins.gg`,
    description,
    // Canonical points to the FULL item page — /s/<slug> is a shareable
    // alternate surface, not a duplicate page. Without this Google flags
    // the two as competing and may split ranking signals.
    alternates: { canonical: `/items/${item.slug}` },
    openGraph: {
      title: `${item.name} · sboxskins.gg`,
      description,
      type: "website",
      url: `https://sboxskins.gg/s/${item.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${item.name} · sboxskins.gg`,
      description,
    },
    robots: {
      // Let Google see the page (for OG image resolution), but don't
      // add it to search results. Canonical tag already signals the
      // canonical URL for any crawler that does index it.
      index: false,
      follow: true,
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const { slug } = await params;
  const item = await getItem(slug);
  if (!item) notFound();

  // Momentum score — we compute across all items so this is O(N) per
  // request. It's fine at 80 items; revisit once the catalog grows or
  // cache the scores in Redis with a short TTL.
  const scored = await scoreAllItems();
  const myScore = scored.find((s) => s.itemId === item.id);

  const priceSeries = item.priceHistory
    .filter((p) => p.price > 0)
    .map((p) => p.price);

  const change24h =
    item.priceChange24h != null
      ? { pct: item.priceChange24h, positive: item.priceChange24h >= 0 }
      : null;

  // Key stats shown as cards. Each `?? null` — we render dashes rather
  // than zeros so readers can tell "no data" from "literally zero".
  const stats: Array<{ label: string; value: string; tint?: string }> = [];
  if (item.currentPrice != null) {
    stats.push({
      label: "Market price",
      value: formatPrice(item.currentPrice),
    });
  }
  if (item.storePrice != null) {
    stats.push({
      label: "Original store",
      value: formatPrice(item.storePrice),
    });
  }
  if (change24h) {
    stats.push({
      label: "24h change",
      value: `${change24h.pct >= 0 ? "+" : ""}${change24h.pct.toFixed(1)}%`,
      tint: change24h.positive ? "text-emerald-400" : "text-red-400",
    });
  }
  if (item.totalSupply != null) {
    stats.push({
      label: "Total supply",
      value: item.totalSupply.toLocaleString(),
    });
  }
  if (item.uniqueOwners != null) {
    stats.push({
      label: "Unique owners",
      value: item.uniqueOwners.toLocaleString(),
    });
  }
  if (item.scarcityScore != null) {
    stats.push({
      label: "Scarcity",
      value: `${item.scarcityScore.toFixed(0)}/100`,
    });
  }
  if (myScore && myScore.momentumScore > 0) {
    stats.push({
      label: "Momentum",
      value: `${myScore.momentumScore.toFixed(0)}/100`,
      tint: "text-purple-300",
    });
  }
  if (item.leavingStoreAt) {
    const days = Math.ceil(
      (item.leavingStoreAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    if (days >= 0 && days <= 60) {
      stats.push({
        label: "Leaves store",
        value: `${days}d`,
        tint: "text-amber-300",
      });
    }
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: `${item.name} — ${item.type} for S&box. Snapshot on sboxskins.gg.`,
    url: `https://sboxskins.gg/s/${item.slug}`,
    ...(item.imageUrl && !item.imageUrl.startsWith("/items/")
      ? { image: item.imageUrl }
      : {}),
    offers: {
      "@type": "Offer",
      price: item.currentPrice ?? 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0812] via-[#0f0a1f] to-[#1a0a2e]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        {/* Branded header — sboxskins.gg must always be legible even after a
            lossy screenshot compression, so we tint it and bold it. */}
        <header className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            sboxskins.gg
          </Link>
          <CopyLinkButton slug={item.slug} />
        </header>

        {/* Poster card — intentionally self-contained so a screenshot of
            JUST this card still has our name in it (bottom watermark). */}
        <article
          className="relative overflow-hidden rounded-2xl border border-purple-500/25 bg-neutral-950/80 backdrop-blur shadow-[0_0_80px_-20px_rgba(168,85,247,0.35)]"
          data-testid="share-card"
        >
          <div className="p-6 sm:p-10">
            <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
              {item.imageUrl ? (
                <div className="relative w-40 h-40 sm:w-48 sm:h-48 shrink-0 rounded-xl overflow-hidden bg-neutral-900 ring-1 ring-purple-500/20">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 160px, 192px"
                    className="object-cover"
                    priority
                  />
                </div>
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.2em] text-purple-300 mb-2">
                  S&box · {item.type}
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
                  {item.name}
                </h1>
                {item.description && (
                  <p className="text-sm text-neutral-400 leading-relaxed line-clamp-3">
                    {item.description}
                  </p>
                )}
              </div>
            </div>

            {/* Stat grid. Auto-fits based on populated fields — an item
                with no supply data shows a tighter grid instead of empty
                placeholder cards. */}
            {stats.length > 0 && (
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                      {s.label}
                    </p>
                    <p
                      className={`text-lg font-semibold ${
                        s.tint ?? "text-white"
                      }`}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {priceSeries.length >= 3 && (
              <div className="mt-8">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                    Price history
                  </p>
                  <p className="text-[10px] text-neutral-600">
                    {priceSeries.length} datapoints
                  </p>
                </div>
                <ShareSparkline
                  values={priceSeries}
                  positive={(change24h?.positive ?? true) === true}
                />
              </div>
            )}

            {myScore && myScore.rationale.length > 0 && (
              <div className="mt-6 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-purple-300 mb-1.5">
                  Why we're watching
                </p>
                <ul className="text-sm text-neutral-200 space-y-0.5">
                  {myScore.rationale.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Bottom watermark — visible in any screenshot that includes
                the card. Don't rely on browser chrome for branding. */}
            <div className="mt-8 pt-6 border-t border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-neutral-500">
                Live data · sboxskins.gg/s/{item.slug}
              </span>
              <Link
                href={`/items/${item.slug}`}
                className="inline-flex items-center gap-1 text-purple-300 hover:text-purple-200 font-medium"
              >
                Full details
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </article>

        <p className="mt-6 text-center text-xs text-neutral-600">
          Snapshot data may be a few minutes stale. The{" "}
          <Link
            href={`/items/${item.slug}`}
            className="text-purple-400 hover:text-purple-300"
          >
            full item page
          </Link>{" "}
          has live order book + holders.
        </p>
      </div>
    </div>
  );
}

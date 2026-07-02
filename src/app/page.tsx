import { Flame } from "lucide-react";
import { prisma } from "@/lib/db";
import { ItemCard } from "@/components/items/item-card";
import { type NewDropItem } from "@/components/items/new-drop-card";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { HomeHero } from "@/components/home/home-hero";
import { StatChips } from "@/components/home/stat-chips";
import { SectionHeader } from "@/components/home/section-header";
import { MoversPanels } from "@/components/home/movers-panels";
import { CategoryGrid } from "@/components/home/category-grid";
import { FlexesGrid } from "@/components/home/flexes-grid";
import { RarestGrid } from "@/components/home/rarest-grid";
import { FreshDropsGrid } from "@/components/home/fresh-drops-grid";
import { FeaturesGrid } from "@/components/home/features-grid";
import { NewsletterOptin } from "@/components/home/newsletter-optin";
import { AboutSection } from "@/components/home/about-section";
import type { HomeItem } from "@/components/home/types";

// Render at request time — homepage data changes every sync cycle (15-30 min).
// Next.js will cache the rendered HTML briefly at the edge anyway.
export const revalidate = 1800; // 30 minutes — matches the sync cadence

// New Drops teaser mirrors the /new page's 30-day createdAt window.
const NEW_DROPS_WINDOW_DAYS = 30;

// Helper keeps Date.now() out of the component render body (react-hooks/purity).
function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function getHomepageData() {
  // One roundtrip to the DB for everything we need on the homepage.
  // Running these in parallel so we don't stall the response.
  const [allItems, trending, losers, expensive, rarest, limited, storeDrops, mostTraded, newDrops] =
    await Promise.all([
      prisma.item.findMany({
        select: { currentPrice: true, volume: true, totalSupply: true, type: true },
      }),
      prisma.item.findMany({
        orderBy: { priceChange24h: "desc" },
        take: 6,
      }),
      prisma.item.findMany({
        orderBy: { priceChange24h: "asc" },
        take: 6,
      }),
      // Most Valuable — null currentPrice items get pushed to the bottom
      // (was top by Postgres default for DESC), so the real high-priced
      // items lead the list instead of the unpriced ones overriding them.
      prisma.item.findMany({
        orderBy: { currentPrice: { sort: "desc", nulls: "last" } },
        take: 6,
      }),
      prisma.item.findMany({
        where: { totalSupply: { not: null, gt: 0 } },
        orderBy: { totalSupply: "asc" },
        take: 6,
      }),
      prisma.item.findMany({
        where: { isLimited: true },
        take: 6,
      }),
      // New homepage section — items in the active store rotation, most
      // recently released first. Only items with isActiveStoreItem so we
      // don't show stuff that already left rotation.
      prisma.item.findMany({
        where: {
          isActiveStoreItem: true,
          releaseDate: { not: null },
        },
        orderBy: { releaseDate: "desc" },
        take: 6,
      }),
      // New homepage section — most-traded by total sales count (sbox.dev's
      // `sales` field). Falls back gracefully when totalSales is null
      // because the orderBy uses nulls: "last". Filter to non-zero so
      // brand-new untracked items don't accidentally lead.
      prisma.item.findMany({
        where: { totalSales: { not: null, gt: 0 } },
        orderBy: { totalSales: { sort: "desc", nulls: "last" } },
        take: 6,
      }),
      // New Drops teaser — newest items added in the last 30 days, newest
      // first. Mirrors the /new feed; NewDropCard needs createdAt +
      // steamItemNameId for the "added Xd ago" / syncing badges.
      prisma.item.findMany({
        // Hide the internal QA Team T-Shirt (non-marketable) from Fresh Drops,
        // matching the /new feed.
        where: {
          createdAt: { gte: windowStart(NEW_DROPS_WINDOW_DAYS) },
          slug: { not: "qa-team-t-shirt" },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          imageUrl: true,
          currentPrice: true,
          priceChange24h: true,
          volume: true,
          isLimited: true,
          createdAt: true,
          steamItemNameId: true,
          rarityColor: true,
        },
      }),
    ]);

  const lastUpdatedRow = await prisma.item.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  // Compute homepage-wide stats from the all-items query
  const prices = allItems.map((i) => i.currentPrice ?? 0).filter((p) => p > 0);
  const totalListings = allItems.reduce((sum, i) => sum + (i.volume ?? 0), 0);
  // listingsValue = price × active-listings (what Steam has for sale right now)
  const listingsValue = allItems.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.volume ?? 0),
    0,
  );
  // estMarketCap = price × totalSupply, but only for items where supply is known.
  // This is the true "market cap" concept vs listingsValue (which is just liquidity).
  const itemsWithSupply = allItems.filter(
    (i) => i.totalSupply != null && i.totalSupply > 0 && (i.currentPrice ?? 0) > 0,
  );
  const estMarketCap = itemsWithSupply.reduce(
    (sum, i) => sum + (i.currentPrice ?? 0) * (i.totalSupply ?? 0),
    0,
  );
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  const categoryCounts: Record<string, number> = {};
  for (const item of allItems) {
    categoryCounts[item.type] = (categoryCounts[item.type] ?? 0) + 1;
  }

  return {
    trending: trending as unknown as HomeItem[],
    losers: losers as unknown as HomeItem[],
    expensive: expensive as unknown as HomeItem[],
    rarest: rarest as unknown as HomeItem[],
    limited: limited as unknown as HomeItem[],
    storeDrops: storeDrops as unknown as HomeItem[],
    mostTraded: mostTraded as unknown as HomeItem[],
    newDrops: newDrops as NewDropItem[],
    categoryCounts,
    stats: {
      totalItems: allItems.length,
      avgPrice,
      listingsValue,
      estMarketCap,
      estMarketCapItemCount: itemsWithSupply.length,
      totalListings,
      lastUpdated: lastUpdatedRow?.updatedAt.toISOString() ?? null,
    },
  };
}

export default async function HomePage() {
  const {
    trending,
    losers,
    expensive,
    rarest,
    limited,
    storeDrops,
    mostTraded,
    newDrops,
    categoryCounts,
    stats,
  } = await getHomepageData();

  return (
    <div>
      <AnnouncementBanner
        id="store-rotation-april-29"
        text="🎮 New store items available!"
        ctaText="Check out the blog"
        href="/blog/store-rotation-april-29"
      />

      {/* Hero — eyebrow + H1 + CTAs, animated glow blobs, featured mover card */}
      <HomeHero featured={trending[0]} trackedCount={stats.totalItems} />

      {/* Stat chips */}
      <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-1.5">
        <StatChips stats={stats} />
      </section>

      {/* Hot right now */}
      <section id="hot" className="mx-auto max-w-[1240px] scroll-mt-20 px-6 pb-2 pt-11">
        <SectionHeader
          icon={<Flame className="h-[26px] w-[26px] text-accent" fill="currentColor" />}
          title="Hot right now"
          subtitle="The skins everyone's buying today."
          link={{ href: "/items?sort=change-desc", label: "View all" }}
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {trending.slice(0, 6).map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* Biggest movers */}
      <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
        <SectionHeader
          title="Biggest movers"
          subtitle="Who's pumping and who's dumping in the last 24 hours."
        />
        <MoversPanels gainers={trending.slice(0, 5)} losers={losers.slice(0, 5)} />
      </section>

      {/* Browse by category */}
      <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
        <SectionHeader
          title="Browse by category"
          subtitle="Jump straight to the kind of skin you're after."
        />
        <CategoryGrid counts={categoryCounts} />
      </section>

      {/* Biggest flexes — most valuable */}
      <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
        <SectionHeader
          title="Biggest flexes"
          subtitle="The most valuable S&box skins money can buy."
          link={{ href: "/leaderboard", label: "Leaderboard" }}
        />
        <FlexesGrid items={expensive} />
      </section>

      {/* Most traded — highest lifetime Steam-tracked sales */}
      {mostTraded.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
          <SectionHeader
            title="Most traded"
            subtitle="Highest lifetime sales across the catalog."
            link={{ href: "/items?sort=volume-desc", label: "View all" }}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {mostTraded.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Rarest of the rare — hidden when no supply-graded items exist */}
      {rarest.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
          <SectionHeader
            title="Rarest of the rare"
            subtitle="Lowest supply in the game — blink and they're gone."
            link={{ href: "/items?sort=supply-asc&hasSupply=true", label: "View all" }}
          />
          <RarestGrid items={rarest.slice(0, 6)} />
        </section>
      )}

      {/* Limited editions — capped-supply skins, paired with Rarest by theme */}
      {limited.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
          <SectionHeader
            title="Limited editions"
            subtitle="Capped-supply S&box skins — no more can ever be minted."
            link={{ href: "/items?isLimited=true", label: "View all" }}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {limited.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Fresh drops — hidden when the 30-day window is empty */}
      {newDrops.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
          <SectionHeader
            title="Fresh drops"
            subtitle="Just added to the tracker — get in early."
            link={{ href: "/new", label: "View all" }}
          />
          <FreshDropsGrid items={newDrops} />
        </section>
      )}

      {/* New store drops — the live in-game store rotation, freshest first */}
      {storeDrops.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
          <SectionHeader
            title="New store drops"
            subtitle="The latest skins live in the in-game store."
            link={{ href: "/store", label: "View store" }}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {storeDrops.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Features — cross-links to the site's main tools */}
      <section className="mx-auto max-w-[1240px] px-6 pb-2 pt-11">
        <SectionHeader
          title="Everything you need to trade smarter"
          subtitle="Charts, leaderboards, inventory valuation, and your personal watchlist."
        />
        <FeaturesGrid />
      </section>

      {/* Newsletter opt-in */}
      <section className="mx-auto max-w-[1240px] px-6 py-12">
        <NewsletterOptin />
      </section>

      {/* About the S&box cosmetics market — SEO content */}
      <AboutSection />
    </div>
  );
}

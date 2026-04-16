import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Flame,
  Crown,
  Package,
  DollarSign,
  Gamepad2,
  BarChart3,
  ShoppingCart,
  Clock,
  Sparkles,
  User,
  Shirt,
  Gem,
  Sword,
  Wrench,
  LineChart,
  Trophy,
  Eye,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/items/item-card";
import { prisma } from "@/lib/db";
import { formatPrice, formatRelativeTime } from "@/lib/utils";

// Render at request time — homepage data changes every sync cycle (15-30 min).
// Next.js will cache the rendered HTML briefly at the edge anyway.
export const revalidate = 300; // 5 minutes

interface Item {
  id: string;
  name: string;
  slug: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  totalSupply: number | null;
  isLimited: boolean;
}

const categories = [
  {
    type: "accessory",
    label: "Accessories",
    Icon: Gem,
    color: "from-cyan-500/20 to-cyan-600/5",
    iconColor: "text-cyan-400",
    description: "Hats, masks, glasses & more",
  },
  {
    type: "clothing",
    label: "Clothing",
    Icon: Shirt,
    color: "from-pink-500/20 to-pink-600/5",
    iconColor: "text-pink-400",
    description: "Outfits, tops, pants, shoes",
  },
  {
    type: "character",
    label: "Characters",
    Icon: User,
    color: "from-purple-500/20 to-purple-600/5",
    iconColor: "text-purple-400",
    description: "Full character skins",
  },
  {
    type: "weapon",
    label: "Weapons",
    Icon: Sword,
    color: "from-red-500/20 to-red-600/5",
    iconColor: "text-red-400",
    description: "Weapon skins & reskins",
  },
  {
    type: "tool",
    label: "Tools",
    Icon: Wrench,
    color: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-400",
    description: "Tool reskins",
  },
];

const features = [
  {
    href: "/trends",
    Icon: LineChart,
    title: "Market Trends",
    description: "Charts, top movers, and type breakdown across 7, 30, or 90 days.",
    color: "from-purple-500/10 to-transparent",
    iconColor: "text-purple-400",
  },
  {
    href: "/leaderboard",
    Icon: Trophy,
    title: "Leaderboard",
    description: "Most valuable, biggest gainers, and most-listed S&box skins.",
    color: "from-amber-500/10 to-transparent",
    iconColor: "text-amber-400",
  },
  {
    href: "/inventory",
    Icon: Eye,
    title: "Inventory Checker",
    description: "Estimate the total value of any Steam user's S&box inventory.",
    color: "from-blue-500/10 to-transparent",
    iconColor: "text-blue-400",
  },
  {
    href: "/portfolio",
    Icon: Star,
    title: "Your Watchlist",
    description: "Track the skins you care about and monitor their market value.",
    color: "from-emerald-500/10 to-transparent",
    iconColor: "text-emerald-400",
  },
];

async function getHomepageData() {
  // One roundtrip to the DB for everything we need on the homepage.
  // Running these in parallel so we don't stall the response.
  const [allItems, trending, losers, expensive, rarest, limited] = await Promise.all([
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
    prisma.item.findMany({
      orderBy: { currentPrice: "desc" },
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
    trending: trending as unknown as Item[],
    losers: losers as unknown as Item[],
    expensive: expensive as unknown as Item[],
    rarest: rarest as unknown as Item[],
    limited: limited as unknown as Item[],
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
  const { trending, losers, expensive, rarest, limited, categoryCounts, stats } =
    await getHomepageData();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-neutral-800">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-6">
              <Gamepad2 className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-purple-300">The S&box Cosmetics Market Tracker</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
              S&box Cosmetics &{" "}
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Skin Market
              </span>{" "}
              Tracker
            </h1>
            <p className="text-lg text-neutral-400 mb-8 max-w-2xl mx-auto">
              Every S&box cosmetic on the Steam Community Market — live prices, order books,
              24-hour and 7-day trends, and total supply data. The go-to source for S&box skin
              market data, updated every 15–30 minutes.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/items">
                <Button size="lg" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                  Browse All Skins
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/trends">
                <Button variant="outline" size="lg" className="gap-2">
                  <LineChart className="h-4 w-4" />
                  Market Trends
                </Button>
              </Link>
              <Link href="/inventory">
                <Button variant="outline" size="lg" className="gap-2">
                  <Search className="h-4 w-4" />
                  Check Inventory
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-neutral-800 bg-neutral-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-500/10">
                <BarChart3 className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">
                  {stats.estMarketCap > 0 ? formatPrice(stats.estMarketCap) : "—"}
                </p>
                <p className="text-[11px] text-neutral-500">
                  Est. Market Cap
                  {stats.estMarketCap > 0 && stats.estMarketCapItemCount < stats.totalItems && (
                    <span className="text-neutral-600">
                      {" "}· {stats.estMarketCapItemCount}/{stats.totalItems}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <DollarSign className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{formatPrice(stats.avgPrice)}</p>
                <p className="text-[11px] text-neutral-500">Avg Price</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <ShoppingCart className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">
                  {stats.totalListings.toLocaleString()}
                </p>
                <p className="text-[11px] text-neutral-500">Active Listings</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <Package className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats.totalItems}</p>
                <p className="text-[11px] text-neutral-500">Tracked Skins</p>
              </div>
            </div>
          </div>
          {stats.lastUpdated && (
            <div className="flex items-center justify-center gap-1.5 mt-4 text-[11px] text-neutral-500">
              <Clock className="h-3 w-3" />
              <span>Data last updated {formatRelativeTime(stats.lastUpdated)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Browse by Category */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Browse by Category</h2>
            <p className="text-sm text-neutral-500">
              Filter S&box skins by the category that matches what you&apos;re looking for.
            </p>
          </div>
          <Link href="/items">
            <Button variant="ghost" size="sm" className="text-neutral-400 gap-1">
              All Skins <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {categories
            .filter((cat) => (categoryCounts[cat.type] ?? 0) > 0)
            .map((cat) => {
              const count = categoryCounts[cat.type] ?? 0;
              return (
                <Link
                  key={cat.type}
                  href={`/items/type/${cat.type}`}
                  className={`group relative overflow-hidden rounded-xl border border-neutral-800 bg-gradient-to-br ${cat.color} p-5 transition hover:border-neutral-700 hover:scale-[1.02]`}
                >
                  <div className={`inline-flex p-2.5 rounded-lg bg-neutral-900/60 mb-3`}>
                    <cat.Icon className={`h-5 w-5 ${cat.iconColor}`} />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">
                    {cat.label}
                    <span className="ml-2 text-xs text-neutral-500 font-normal">{count}</span>
                  </h3>
                  <p className="text-xs text-neutral-400 leading-snug">{cat.description}</p>
                  <ArrowRight className="absolute top-5 right-5 h-4 w-4 text-neutral-600 group-hover:text-white transition" />
                </Link>
              );
            })}
        </div>
      </section>

      {/* Trending */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Flame className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Trending Now</h2>
              <p className="text-xs text-neutral-500">
                Biggest S&box skin price gains in the last 24h
              </p>
            </div>
          </div>
          <Link href="/items?sort=change-desc">
            <Button variant="ghost" size="sm" className="text-neutral-400 gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {trending.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* Biggest Movers: Gainers + Losers side by side */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">Biggest Movers</h2>
          <p className="text-sm text-neutral-500">
            The most volatile S&box skins in the last 24 hours.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Gainers */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-emerald-400">Top Gainers</h3>
              </div>
              <Link
                href="/items?sort=change-desc"
                className="text-xs text-emerald-400/60 hover:text-emerald-400 transition"
              >
                View all →
              </Link>
            </div>
            <div className="space-y-1.5">
              {trending.slice(0, 5).map((item) => (
                <MoverRow key={item.id} item={item} />
              ))}
            </div>
          </div>
          {/* Top Losers */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-400" />
                <h3 className="text-base font-semibold text-red-400">Top Losers</h3>
              </div>
              <Link
                href="/items?sort=change-asc"
                className="text-xs text-red-400/60 hover:text-red-400 transition"
              >
                View all →
              </Link>
            </div>
            <div className="space-y-1.5">
              {losers.slice(0, 5).map((item) => (
                <MoverRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Most Expensive */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Crown className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Most Valuable</h2>
              <p className="text-xs text-neutral-500">Highest-priced S&box skins on the market</p>
            </div>
          </div>
          <Link href="/items?sort=price-desc">
            <Button variant="ghost" size="sm" className="text-neutral-400 gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {expensive.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* Rarest Items */}
      {rarest.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Sparkles className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Rarest Skins</h2>
                <p className="text-xs text-neutral-500">
                  Lowest total supply — the scarcest S&box cosmetics in existence
                </p>
              </div>
            </div>
            <Link href="/items?sort=supply-asc&hasSupply=true">
              <Button variant="ghost" size="sm" className="text-neutral-400 gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {rarest.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Limited Edition */}
      {limited.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Limited Editions</h2>
                <p className="text-xs text-neutral-500">
                  Capped-supply S&box skins — no more can be minted
                </p>
              </div>
            </div>
            <Link href="/items?isLimited=true">
              <Button variant="ghost" size="sm" className="text-neutral-400 gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {limited.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Features Grid */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Everything you need to trade smarter</h2>
          <p className="text-sm text-neutral-500 max-w-xl mx-auto">
            sboxskins.gg goes beyond prices — every feature built to help you make informed decisions
            about S&box skins.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature) => (
            <Link
              key={feature.href}
              href={feature.href}
              className={`group relative overflow-hidden rounded-xl border border-neutral-800 bg-gradient-to-br ${feature.color} p-6 transition hover:border-neutral-700`}
            >
              <div className="inline-flex p-2.5 rounded-lg bg-neutral-900/70 mb-4">
                <feature.Icon className={`h-5 w-5 ${feature.iconColor}`} />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">{feature.description}</p>
              <ArrowRight className="absolute top-6 right-6 h-4 w-4 text-neutral-600 group-hover:text-white transition" />
            </Link>
          ))}
        </div>
      </section>

      {/* About the S&box Cosmetics Market — SEO content */}
      <section className="border-t border-neutral-800 bg-neutral-950/50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-3xl font-bold text-white mb-3 text-center">
            About the S&box Cosmetics Market
          </h2>
          <p className="text-center text-neutral-400 mb-10">
            Everything you need to know about S&box skins, cosmetics, and the Steam Market
            economy that prices them.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-neutral-300 leading-relaxed">
            <div>
              <h3 className="text-white font-semibold mb-2">What are S&box skins and cosmetics?</h3>
              <p className="text-neutral-400">
                S&box skins (sometimes called S&box cosmetics) are customization items for
                S&box — the sandbox game from Facepunch Studios, the studio behind Garry&apos;s
                Mod and Rust. Cosmetics include hats, clothing, character models, weapon
                reskins, and accessories that let players personalize their in-game avatar.
                Every S&box cosmetic is tradable through the Steam Community Market.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">Where do S&box market prices come from?</h3>
              <p className="text-neutral-400">
                We pull live S&box market prices and order book data directly from the Steam
                Community Market every 15–30 minutes, 24/7. Total supply counts come from
                sbox.game&apos;s official skin metrics page. Price history is stored over time
                so you can track S&box cosmetics values across days, weeks, and months.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">How do I buy or sell S&box cosmetics?</h3>
              <p className="text-neutral-400">
                All S&box cosmetics trading happens on the Steam Community Market. Find an item
                you want on sboxskins.gg, click &ldquo;View on Steam Market&rdquo;, and complete
                the transaction through Steam. To sell, open your Steam Inventory and list your
                S&box cosmetic — check our order book first to price it competitively.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">What makes an S&box skin valuable?</h3>
              <p className="text-neutral-400">
                S&box skin prices are driven by scarcity and demand. Lower total supply,
                limited-edition status, delisted store availability, and cosmetic appeal all
                push prices up on the S&box market. Our
                <Link href="/trends" className="text-purple-400 hover:underline"> trends page</Link>{" "}
                and{" "}
                <Link href="/leaderboard" className="text-purple-400 hover:underline">
                  leaderboard
                </Link>{" "}
                track these signals in real time so you can spot the next big S&box cosmetics
                mover.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">Is there an S&box marketplace?</h3>
              <p className="text-neutral-400">
                Yes — the Steam Community Market is the official S&box marketplace. We aggregate
                every S&box cosmetic listed there, add supply and scarcity data, and make it
                searchable, filterable, and comparable on one page. Think of sboxskins.gg as
                the analytics layer on top of the S&box skin market.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">How big is the S&box cosmetics market?</h3>
              <p className="text-neutral-400">
                Thousands of active listings across every tracked S&box skin and cosmetic. Total
                listings value and supply-based market cap are summarized on our{" "}
                <Link href="/trends" className="text-purple-400 hover:underline">trends page</Link>
                , recalculated on every sync so you always see the current S&box market size.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link href="/faq">
              <Button variant="outline" size="lg" className="gap-2">
                Read the full FAQ
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Compact row for the Biggest Movers section — server component, no interactivity. */
function MoverRow({ item }: { item: Item }) {
  const change = item.priceChange24h ?? 0;
  const isUp = change > 0;
  return (
    <Link
      href={`/items/${item.slug}`}
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800/40 transition group"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="h-8 w-8 rounded object-cover bg-neutral-900 flex-shrink-0"
          />
        ) : (
          <div className="h-8 w-8 rounded bg-neutral-800 flex items-center justify-center flex-shrink-0">
            <Package className="h-4 w-4 text-neutral-600" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm text-white truncate group-hover:text-purple-300 transition">
            {item.name}
          </div>
          <div className="text-[11px] text-neutral-500 capitalize">{item.type}</div>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-semibold text-white">
          {item.currentPrice != null ? formatPrice(item.currentPrice) : "—"}
        </div>
        <div className={`text-[11px] font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
          {isUp ? "+" : ""}
          {change.toFixed(1)}%
        </div>
      </div>
    </Link>
  );
}

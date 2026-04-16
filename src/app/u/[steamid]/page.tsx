import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ItemImage } from "@/components/items/item-image";
import { formatPrice } from "@/lib/utils";
import { ExternalLink, Wallet, Package } from "lucide-react";

// Inventory data is user-specific and we don't want to cache too aggressively
export const revalidate = 600; // 10 min

const STEAM_APPID = 590830;

interface PageProps {
  params: Promise<{ steamid: string }>;
}

interface SteamAsset {
  classid: string;
  instanceid: string;
  amount: string;
}
interface SteamDescription {
  classid: string;
  instanceid: string;
  name: string;
  market_hash_name: string;
  type: string;
  icon_url: string;
  marketable: number;
}
interface SteamInventory {
  assets?: SteamAsset[];
  descriptions?: SteamDescription[];
  success?: number | boolean;
  total_inventory_count?: number;
}

async function fetchInventory(steamid64: string): Promise<SteamInventory | null> {
  try {
    const res = await fetch(
      `https://steamcommunity.com/inventory/${steamid64}/${STEAM_APPID}/2?l=english&count=2000`,
      {
        // No custom User-Agent — AGENTS.md #1.
        headers: { Accept: "application/json" },
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(10000),
      },
    );
    let data: SteamInventory;
    try {
      data = await res.json();
    } catch {
      return null;
    }
    if (!res.ok && data?.success !== 1 && data?.success !== true) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// React.cache() dedupes across generateMetadata + page component within a
// single request — otherwise we'd hit Steam's XML endpoint twice per visit.
const resolveSteamProfile = cache(
  async (steamid64: string): Promise<{ name: string; avatar: string } | null> => {
    try {
      const res = await fetch(
        `https://steamcommunity.com/profiles/${steamid64}?xml=1`,
        { next: { revalidate: 3600 } },
      );
      if (!res.ok) return null;
      const xml = await res.text();
      const name = xml.match(/<steamID><!\[CDATA\[(.+?)\]\]><\/steamID>/)?.[1] ?? "Unknown";
      const avatar = xml.match(/<avatarFull><!\[CDATA\[(.+?)\]\]><\/avatarFull>/)?.[1] ?? "";
      return { name, avatar };
    } catch {
      return null;
    }
  },
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { steamid } = await params;
  if (!/^\d{17}$/.test(steamid)) return { title: "Invalid profile" };
  const profile = await resolveSteamProfile(steamid);
  const name = profile?.name ?? "S&box collector";
  return {
    title: `${name}'s S&box Skins Portfolio`,
    description: `View ${name}'s S&box skin inventory — items, quantities, and total estimated value on the Steam Community Market.`,
    alternates: { canonical: `/u/${steamid}` },
    openGraph: {
      title: `${name}'s S&box Portfolio`,
      description: `Estimated value on sboxskins.gg`,
      images: profile?.avatar ? [profile.avatar] : [],
    },
  };
}

export default async function UserPortfolioPage({ params }: PageProps) {
  const { steamid } = await params;
  if (!/^\d{17}$/.test(steamid)) notFound();

  const [inv, profile, allItems] = await Promise.all([
    fetchInventory(steamid),
    resolveSteamProfile(steamid),
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        imageUrl: true,
        currentPrice: true,
        steamMarketId: true,
      },
    }),
  ]);

  const byHashName = new Map(allItems.map((i) => [i.steamMarketId?.toLowerCase() ?? "", i]));

  let totalValue = 0;
  const items: {
    name: string;
    slug: string;
    imageUrl: string | null;
    type: string;
    price: number;
    quantity: number;
    value: number;
  }[] = [];

  if (inv?.assets && inv.descriptions) {
    const descMap = new Map<string, SteamDescription>();
    for (const d of inv.descriptions) {
      descMap.set(`${d.classid}_${d.instanceid}`, d);
    }
    const counts = new Map<string, { hashName: string; quantity: number }>();
    for (const asset of inv.assets) {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
      if (!desc) continue;
      const existing = counts.get(desc.market_hash_name) ?? {
        hashName: desc.market_hash_name,
        quantity: 0,
      };
      existing.quantity += parseInt(asset.amount, 10) || 1;
      counts.set(desc.market_hash_name, existing);
    }
    for (const { hashName, quantity } of counts.values()) {
      const match = byHashName.get(hashName.toLowerCase());
      if (!match) continue;
      const price = match.currentPrice ?? 0;
      const value = price * quantity;
      totalValue += value;
      items.push({
        name: match.name,
        slug: match.slug,
        imageUrl: match.imageUrl,
        type: match.type,
        price,
        quantity,
        value,
      });
    }
    items.sort((a, b) => b.value - a.value);
  }

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        {profile?.avatar && (
          <img
            src={profile.avatar}
            alt=""
            className="h-16 w-16 rounded-lg border border-neutral-700/50"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">
            {profile?.name ?? "S&box Collector"}
          </h1>
          <a
            href={`https://steamcommunity.com/profiles/${steamid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 mt-1"
          >
            Steam profile
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Portfolio value</span>
          </div>
          <p className="text-xl font-bold text-white">{formatPrice(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Total items</span>
          </div>
          <p className="text-xl font-bold text-white">{totalQty.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Unique</span>
          </div>
          <p className="text-xl font-bold text-white">{items.length}</p>
        </div>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-12 text-center">
          <p className="text-sm text-neutral-500">
            No S&box items found in this inventory, or the inventory is private.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_80px_80px] gap-0 border-b border-neutral-800 bg-neutral-900 px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Item</div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 text-right">Qty</div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 text-right">Price</div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 text-right">Value</div>
          </div>
          {items.map((item) => (
            <Link
              key={item.slug}
              href={`/items/${item.slug}`}
              className="grid grid-cols-[1fr_80px_80px_80px] gap-0 px-4 py-2.5 border-b border-neutral-800/50 last:border-b-0 hover:bg-neutral-800/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ItemImage
                  src={item.imageUrl}
                  name={item.name}
                  type={item.type}
                  size="sm"
                  className="h-8 w-8 rounded-md border border-neutral-700/50 shrink-0"
                />
                <span className="text-sm text-neutral-100 truncate">{item.name}</span>
              </div>
              <div className="text-sm text-neutral-400 text-right self-center">{item.quantity}</div>
              <div className="text-sm text-neutral-400 text-right self-center">{formatPrice(item.price)}</div>
              <div className="text-sm font-semibold text-white text-right self-center">{formatPrice(item.value)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

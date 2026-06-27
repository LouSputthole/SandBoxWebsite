"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  User,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  Boxes,
  Zap,
  Search,
  Lock,
  ExternalLink,
  HelpCircle,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { StatCard } from "@/components/data";
import { SkinTile } from "@/components/items/skin-tile";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { useAuth } from "@/lib/auth/context";
import { rarityCssColor, rarityLabel } from "@/lib/rarity";

/**
 * Arcade "Inventory checker" — Steam-URL lookup → profile + estimated value
 * + value-by-rarity bar + qty-badged item grid. This is purely a presentation
 * rebuild of the former `inventory-checker.tsx`: the Steam-URL resolution +
 * fetch + match pipeline (runLookup / handleSubmit) is byte-for-byte the same
 * client behavior; only the markup/styling changed to match the Arcade mockup.
 *
 * Data note: the /api/inventory/match payload now returns each matched item's
 * Steam `rarityColor`, so the "Value by rarity" bar (and each tile's tint) uses
 * the REAL grade color + tier name when present. Items with no graded rarity
 * fall back to a price-tier proxy (VALUE_TIERS below) so the bar stays
 * populated either way. See segmentForItem / VALUE_TIERS.
 */

interface InventoryItem {
  name: string;
  slug: string | null;
  type: string;
  imageUrl: string | null;
  rarityColor: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  marketable: boolean;
}

interface InventoryResult {
  steamid64: string;
  totalItems: number;
  uniqueItems: number;
  totalValue: number;
  items: InventoryItem[];
}

/**
 * Price → tier proxy. The match API doesn't return Steam rarity, so we bucket
 * each priced item by its unit price into the four Arcade rarity colors. Used
 * for both the value-by-rarity bar and each tile's gradient tint so the two
 * read consistently. Ordered high → low; classify with the first `min` hit.
 */
const VALUE_TIERS = [
  { key: "legendary", label: "Legendary", color: "var(--rarity-legendary)", min: 50 },
  { key: "rare", label: "Rare", color: "var(--rarity-rare)", min: 5 },
  { key: "uncommon", label: "Uncommon", color: "var(--rarity-uncommon)", min: 1 },
  { key: "common", label: "Common", color: "var(--rarity-common)", min: 0 },
] as const;

/** Tier (or null when the item has no tracked price). */
function tierForPrice(unitPrice: number | null) {
  if (unitPrice == null) return null;
  return VALUE_TIERS.find((t) => unitPrice >= t.min) ?? null;
}

/**
 * Resolve an item's value-bar segment (and tile tint source). Prefers the REAL
 * Steam grade — `rarityColor` → CSS color + `rarityLabel` tier name — and only
 * falls back to the price-tier proxy (VALUE_TIERS) when the item carries no
 * graded rarity. Returns null for unpriced items (they don't count toward the
 * value bar). The `key` namespaces real vs proxy so the two never collide.
 */
function segmentForItem(
  item: InventoryItem,
): { key: string; label: string; color: string } | null {
  if (item.totalPrice == null) return null;
  const real = rarityCssColor(item.rarityColor);
  if (real) {
    return { key: `r:${real}`, label: rarityLabel(item.rarityColor) ?? "Graded", color: real };
  }
  const tier = tierForPrice(item.unitPrice);
  if (!tier) return null;
  return { key: `p:${tier.key}`, label: tier.label, color: tier.color };
}

/** Group a 17-digit SteamID64 into 4-char blocks for legibility. */
function groupSteamId(id: string): string {
  return id.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function InventoryView() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryResult | null>(null);

  /**
   * Core lookup: given a resolved SteamID64, fetch the inventory, match
   * it against our price DB, and set result/error state. Reused by both
   * the URL-paste flow and the signed-in-user shortcut button. (Unchanged
   * behavior — copied verbatim from the previous inventory-checker.)
   */
  const runLookup = async (steamid64: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const invUrl = `/api/inventory/fetch?steamid=${steamid64}`;
      let inv: {
        assets?: Array<{ classid: string; instanceid: string; amount: string }>;
        descriptions?: Array<{
          classid: string;
          instanceid: string;
          name: string;
          market_hash_name: string;
          type: string;
          icon_url: string;
          marketable: number;
        }>;
        success?: number | boolean;
        error?: string;
      };
      try {
        const invRes = await fetch(invUrl);
        if (!invRes.ok) {
          const errBody = await invRes.json().catch(() => ({}));
          setError(
            errBody.error ||
              `Failed to fetch inventory (HTTP ${invRes.status}). Try again in a minute.`,
          );
          return;
        }
        inv = await invRes.json();
      } catch (err) {
        console.error("[inventory] Fetch error:", err);
        setError(
          "Could not load inventory. Check your internet connection and try again.",
        );
        return;
      }

      if (inv.success === false || inv.success === 0) {
        setError(
          inv.error ||
            "Steam returned an error. The inventory may be private or this account may not own S&box.",
        );
        return;
      }

      if (!inv.assets || inv.assets.length === 0) {
        setResult({
          steamid64,
          totalItems: 0,
          uniqueItems: 0,
          totalValue: 0,
          items: [],
        });
        return;
      }

      type InvDesc = NonNullable<typeof inv.descriptions>[number];
      const descMap = new Map<string, InvDesc>();
      if (inv.descriptions) {
        for (const d of inv.descriptions) {
          descMap.set(`${d.classid}_${d.instanceid}`, d);
        }
      }

      const counts = new Map<
        string,
        {
          hashName: string;
          quantity: number;
          name: string;
          type: string;
          iconUrl?: string;
          marketable: number;
        }
      >();
      for (const asset of inv.assets) {
        const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
        if (!desc) continue;
        const qty = parseInt(asset.amount, 10) || 1;
        const existing = counts.get(desc.market_hash_name);
        if (existing) {
          existing.quantity += qty;
        } else {
          counts.set(desc.market_hash_name, {
            hashName: desc.market_hash_name,
            quantity: qty,
            name: desc.name,
            type: desc.type ?? "unknown",
            iconUrl: desc.icon_url,
            marketable: desc.marketable,
          });
        }
      }

      const matchRes = await fetch("/api/inventory/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: Array.from(counts.values()) }),
      });
      const matchData = await matchRes.json();
      if (!matchRes.ok) {
        setError(matchData.error || "Failed to match items against database");
        return;
      }

      setResult({ steamid64, ...matchData });
    } catch {
      setError("Unexpected error — please try again");
    } finally {
      setLoading(false);
    }
  };

  /** Logged-in-user shortcut: skip URL parsing entirely. */
  const checkMine = () => {
    if (!user?.steamId) return;
    void runLookup(user.steamId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. Resolve Steam profile URL → SteamID64
      // Parse the URL client-side first to avoid Vercel IP blocks on Steam
      const trimmedUrl = url.trim();
      let steamid64: string | undefined;

      // Try parsing the URL locally
      const profilesMatch = trimmedUrl.match(/\/profiles\/(7656\d{13})/);
      const rawMatch = trimmedUrl.match(/^(7656\d{13})$/);
      if (profilesMatch) {
        steamid64 = profilesMatch[1];
      } else if (rawMatch) {
        steamid64 = rawMatch[1];
      }

      // For vanity URLs (/id/NAME), try client-side XML resolution first
      if (!steamid64) {
        const idMatch = trimmedUrl.match(/\/id\/([^/?#]+)/);
        const vanityName = idMatch?.[1];

        if (vanityName) {
          console.log("[inventory] Resolving vanity name client-side:", vanityName);
          try {
            const xmlRes = await fetch(
              `https://steamcommunity.com/id/${encodeURIComponent(vanityName)}?xml=1`,
            );
            if (xmlRes.ok) {
              const xml = await xmlRes.text();
              const xmlMatch = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
              if (xmlMatch) {
                steamid64 = xmlMatch[1];
                console.log("[inventory] Resolved via client XML:", steamid64);
              }
            }
          } catch (xmlErr) {
            console.warn("[inventory] Client-side XML resolution failed (CORS):", xmlErr);
          }
        }

        // Fall back to server-side resolution
        if (!steamid64) {
          console.log("[inventory] Falling back to server-side resolve");
          const resolveRes = await fetch(
            `/api/inventory/resolve?url=${encodeURIComponent(trimmedUrl)}`,
          );
          const resolveData = await resolveRes.json();
          console.log("[inventory] Server resolve response:", resolveRes.status, resolveData);
          if (!resolveRes.ok) {
            setError(
              resolveData.error ||
                "Could not find this Steam profile. Make sure the URL is correct.",
            );
            return;
          }
          steamid64 = resolveData.steamid64;
        }
      }

      if (!steamid64) {
        setError(
          "Could not parse Steam profile URL. Use the format: https://steamcommunity.com/id/YOURNAME or https://steamcommunity.com/profiles/76561...",
        );
        return;
      }

      console.log("[inventory] Using SteamID64:", steamid64);

      // URL resolve done — hand off to the shared lookup flow. It handles
      // its own loading/error state so we don't need a finally here.
      setLoading(false);
      await runLookup(steamid64);
      return;
    } catch {
      setError("Unexpected error — please try again");
      setLoading(false);
    }
  };

  // When the looked-up account is the signed-in user, we know their Steam
  // display name; for arbitrary lookups we only have the ID. (The avatar tile
  // uses initials/glyph like the mockup rather than a Steam photo.)
  const isSelf = !!(result && user && user.steamId === result.steamid64);
  const displayName = isSelf ? user?.username ?? null : null;

  // Value-by-rarity segments — grouped by REAL Steam grade where available,
  // price-tier proxy otherwise (see segmentForItem). Sorted by value desc so
  // the heaviest grades lead the bar + legend.
  const raritySegments =
    result && result.totalValue > 0
      ? (() => {
          const byKey = new Map<
            string,
            { key: string; label: string; color: string; value: number }
          >();
          for (const it of result.items) {
            const seg = segmentForItem(it);
            if (!seg || it.totalPrice == null) continue;
            const existing = byKey.get(seg.key);
            if (existing) existing.value += it.totalPrice;
            else byKey.set(seg.key, { ...seg, value: it.totalPrice });
          }
          return [...byKey.values()]
            .filter((s) => s.value > 0)
            .sort((a, b) => b.value - a.value);
        })()
      : [];

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-10 pt-9 sm:px-6">
      {/* Header */}
      <div className="mb-[26px] text-center">
        <h1 className="m-0 font-display text-[clamp(30px,6vw,40px)] font-extrabold tracking-[-.02em] text-tx">
          Inventory checker
        </h1>
        <p className="mx-auto mt-[9px] max-w-xl text-[15px] text-mut">
          Estimate the total market value of any Steam user&apos;s S&amp;box
          inventory.
        </p>
      </div>

      {/* Signed-in shortcut — for a logged-in user, a one-click lookup of
          their own inventory is the primary action; the URL box below is for
          scouting someone else's. (Restored from the pre-redesign widget.) */}
      {user && (
        <>
          <div className="mb-[14px] flex justify-center">
            <Button
              type="button"
              onClick={checkMine}
              disabled={loading}
              className="h-[54px] gap-2 rounded-[14px] px-6 text-[15px]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <User className="h-4 w-4" />
              )}
              Check my inventory
              {user.username && (
                <span className="font-normal text-white/75">
                  ({user.username})
                </span>
              )}
            </Button>
          </div>
          <div className="mx-auto mb-[14px] flex max-w-[640px] items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-[10px] uppercase tracking-[1px] text-faint">
              or look up another inventory
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {/* Steam-URL input + Check button */}
      <form
        onSubmit={handleSubmit}
        className="mx-auto mb-[14px] flex max-w-[640px] gap-3"
      >
        <div className="relative flex-1">
          <User
            className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint"
            strokeWidth={2}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            aria-label="Steam profile URL or SteamID"
            placeholder="steamcommunity.com/id/yourname"
            className="h-[54px] w-full rounded-[14px] border border-line bg-panel pl-[46px] pr-4 text-[15px] text-tx outline-none transition-colors placeholder:text-faint focus:[border-color:var(--accent)] disabled:opacity-60"
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !url.trim()}
          className="h-[54px] rounded-[14px] px-6 text-[15px]"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Check inventory"
          )}
        </Button>
      </form>

      <p className="mb-2 text-center text-[12.5px] text-faint">
        Works with Steam ID, vanity URL, or full profile link · inventory must
        be public
      </p>

      {/* No-login reassurance for signed-out visitors — lookups need no
          account; we only read public inventory data. (Restored.) */}
      {!user && (
        <p className="text-center text-[12.5px] text-faint">
          No login required — we only read public inventory data.
        </p>
      )}

      {/* Pre-lookup explainer — three feature cards + an in-widget FAQ, shown
          only before a lookup runs (no loading / error / result). Once results
          or an error appear these become noise, so we hide them. Restored from
          the pre-redesign widget and Arcade-styled; kept distinct from the
          server-rendered SEO FAQ section below the widget. */}
      {!loading && !error && !result && (
        <div className="mx-auto mt-7 max-w-[920px]">
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={Zap}
              color="var(--up)"
              title="Real-time valuation"
              body="Every item priced against live Steam Community Market data, re-synced throughout the day."
            />
            <FeatureCard
              icon={Search}
              color="var(--accent)"
              title="Per-item deep dive"
              body="Open any item for its full price chart, order book, supply, and scarcity score."
            />
            <FeatureCard
              icon={Lock}
              color="var(--rarity-rare)"
              title="Public, no login"
              body="We only read public inventory data — no Steam password, no OAuth, nothing stored."
            />
          </div>

          <div className="mt-4 rounded-[18px] border border-line bg-panel p-6">
            <div className="mb-3 flex items-center gap-2">
              <HelpCircle
                className="h-[18px] w-[18px] text-accent"
                strokeWidth={2}
              />
              <h2 className="m-0 font-display text-[16px] font-bold text-tx">
                Frequently asked
              </h2>
            </div>
            <div className="divide-y divide-line2">
              <FaqItem
                icon={HelpCircle}
                question="How does it work?"
                answer="Paste a Steam profile URL or 17-digit SteamID. We fetch that account's public inventory from Steam, match every S&box item against our live price database, and total it up. Nothing about your visit is stored."
              />
              <FaqItem
                icon={Shield}
                question="Is my data safe?"
                answer="We only read publicly-visible inventory data. We can't see your password, can't trade, and can't modify anything. If your profile is Friends-Only or Private, Steam won't return the inventory — we never see it either."
              />
              <FaqItem
                icon={HelpCircle}
                question="Why doesn't my item show a price?"
                answer={
                  <>
                    Either it&apos;s a brand-new item we haven&apos;t picked up
                    on the next sync yet, or it isn&apos;t marketable on the
                    Steam Community Market. Drop us a note on the{" "}
                    <Link
                      href="/contact"
                      className="font-semibold text-accent hover:underline"
                    >
                      contact page
                    </Link>{" "}
                    if something looks off.
                  </>
                }
              />
              <FaqItem
                icon={HelpCircle}
                question="How do I make my inventory public?"
                answer={
                  <>
                    On Steam: click your name → Edit Profile → Privacy Settings.
                    Set <strong className="text-tx">My Profile</strong>,{" "}
                    <strong className="text-tx">Game Details</strong>, and{" "}
                    <strong className="text-tx">Inventory</strong> all to Public,
                    then Save. Steam&apos;s cache can take a minute to catch up.
                  </>
                }
              />
            </div>
          </div>
        </div>
      )}

      <div className="mb-7" />

      {/* Error */}
      {error && (
        <div className="mx-auto mb-6 flex max-w-[640px] items-start gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--down)_40%,var(--line))] bg-[color-mix(in_srgb,var(--down)_8%,transparent)] p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-down" />
          <div>
            <p className="text-sm text-tx">{error}</p>
            <p className="mt-1 text-xs text-mut">
              Make sure the Steam profile and game details are set to public in{" "}
              <a
                href="https://steamcommunity.com/my/edit/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                Steam Privacy Settings
              </a>
              .
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          {/* Profile + estimated value */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <ProfileCard
              steamid64={result.steamid64}
              displayName={displayName}
            />
            <StatCard
              label="Estimated inventory value"
              value={<Price amount={result.totalValue} />}
              className="flex flex-col justify-center bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_14%,var(--panel)),var(--panel))]"
            />
          </div>

          {/* Item-count stats */}
          <div className="mb-4 grid grid-cols-2 gap-4">
            <StatCard label="Total items" value={result.totalItems.toLocaleString()} />
            <StatCard
              label="Unique items"
              value={result.uniqueItems.toLocaleString()}
            />
          </div>

          {/* Value by rarity (price-tier proxy) */}
          {raritySegments.length > 0 && (
            <div className="mb-6 rounded-[18px] border border-line bg-panel px-5 py-[18px]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13.5px] font-semibold text-tx">
                  Value by rarity
                </span>
                <span className="text-[12px] text-faint">
                  by Steam rarity, price-tier fallback
                </span>
              </div>
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-[6px]">
                {raritySegments.map((s) => (
                  <span
                    key={s.key}
                    title={s.label}
                    className="min-w-[3px]"
                    style={{
                      width: `${(s.value / result.totalValue) * 100}%`,
                      background: s.color,
                    }}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-2">
                {raritySegments.map((s) => (
                  <span
                    key={s.key}
                    className="flex items-center gap-[7px] text-[12.5px] text-tx"
                  >
                    <span
                      className="h-[9px] w-[9px] rounded-[3px]"
                      style={{ background: s.color }}
                    />
                    {s.label}
                    <span className="font-mono text-mut">
                      <Price amount={s.value} />
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          {result.items.length === 0 ? (
            <div className="py-16 text-center text-faint">
              <Boxes className="mx-auto mb-3 h-12 w-12 text-line" />
              <p className="text-sm">No S&amp;box items found in this inventory.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="m-0 font-display text-[24px] font-extrabold tracking-[-.5px] text-tx">
                  Inventory{" "}
                  <span className="text-[16px] font-semibold text-faint">
                    {result.uniqueItems}
                  </span>
                </h2>
                <span className="font-mono text-[12.5px] text-faint">
                  sorted by value
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {result.items.map((item, i) => (
                  <ItemTile key={`${item.slug ?? item.name}-${i}`} item={item} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  steamid64,
  displayName,
}: {
  steamid64: string;
  displayName: string | null;
}) {
  const initials = displayName
    ? displayName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase()
    : null;

  return (
    <div className="flex items-center gap-4 rounded-[18px] border border-line bg-panel p-5">
      <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(140deg,var(--accent),var(--accent2))] font-display text-[22px] font-extrabold text-white">
        {initials ?? <User className="h-7 w-7" strokeWidth={2} />}
      </span>
      <div className="min-w-0">
        <div className="truncate font-display text-[20px] font-bold text-tx">
          {displayName ?? "Steam inventory"}
        </div>
        <div className="truncate font-mono text-[12.5px] text-faint">
          {groupSteamId(steamid64)}
        </div>
        <a
          href={`https://steamcommunity.com/profiles/${steamid64}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
        >
          Steam profile
          <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
        </a>
      </div>
    </div>
  );
}

function ItemTile({ item }: { item: InventoryItem }) {
  // Real Steam grade tint first; price-tier proxy only when ungraded.
  const tint = rarityCssColor(item.rarityColor) ?? tierForPrice(item.unitPrice)?.color ?? null;

  const card: ReactNode = (
    <div
      style={{ "--rc": tint ?? "var(--accent)" } as CSSProperties}
      className="group relative block rounded-[18px] border border-line bg-panel p-[13px] transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--rc)_50%,var(--line))]"
    >
      {/* Open-item-page affordance — the whole tile is already a Link when the
          item has a catalog page; this hover chip signals that explicitly. */}
      {item.slug && (
        <span className="pointer-events-none absolute left-[21px] top-[21px] z-10 flex h-6 w-6 items-center justify-center rounded-[8px] bg-[rgba(14,13,19,.72)] text-mut opacity-0 backdrop-blur-[6px] transition-opacity duration-150 group-hover:text-accent group-hover:opacity-100">
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
      )}
      <SkinTile
        imageUrl={item.imageUrl}
        name={item.name}
        type={item.type}
        rarityColor={tint}
        iconSize="lg"
        className="mb-[11px]"
        badge={
          <span className="rounded-[7px] bg-[rgba(14,13,19,.72)] px-[7px] py-[2px] font-mono text-[11px] font-bold text-tx backdrop-blur-[6px]">
            ×{item.quantity}
          </span>
        }
      />
      <div className="truncate text-[13.5px] font-bold text-tx">{item.name}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] text-faint">
          {item.unitPrice != null ? (
            <>
              <Price amount={item.unitPrice} /> ea
            </>
          ) : (
            "untracked"
          )}
        </span>
        <span className="shrink-0 font-mono text-[14.5px] font-bold text-tx">
          {item.totalPrice != null ? <Price amount={item.totalPrice} /> : "—"}
        </span>
      </div>
    </div>
  );

  return item.slug ? <Link href={`/items/${item.slug}`}>{card}</Link> : card;
}

/**
 * Pre-lookup feature card — an Arcade panel with an accent-tinted icon chip,
 * a title, and a one-line body. `color` is any CSS color (palette token) used
 * for both the icon stroke and a soft tinted chip background.
 */
function FeatureCard({
  icon: Icon,
  color,
  title,
  body,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-5 text-center">
      <span
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[13px]"
        style={{
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
        }}
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
      </span>
      <h3 className="mb-1 text-[14px] font-bold text-tx">{title}</h3>
      <p className="text-[12.5px] leading-relaxed text-mut">{body}</p>
    </div>
  );
}

/** Pre-lookup FAQ row — leading line-icon, question, then answer (string or
 *  rich node, e.g. with the /contact link). Stacked in a hairline-divided
 *  list inside the Arcade FAQ panel. */
function FaqItem({
  icon: Icon,
  question,
  answer,
}: {
  icon: LucideIcon;
  question: string;
  answer: ReactNode;
}) {
  return (
    <div className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      <Icon
        className="mt-0.5 h-[17px] w-[17px] shrink-0 text-faint"
        strokeWidth={2}
      />
      <div>
        <h3 className="mb-1 text-[13.5px] font-semibold text-tx">{question}</h3>
        <p className="text-[13px] leading-relaxed text-mut">{answer}</p>
      </div>
    </div>
  );
}

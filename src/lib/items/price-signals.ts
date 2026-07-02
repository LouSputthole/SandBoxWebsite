import type { ItemDetailData } from "@/components/items/item-detail";

/**
 * Price-signal derivation — a pure read of bullish/bearish/neutral signals from the data already
 * on an item page. Extracted from the price-signals component so the logic is unit-testable
 * (notably: item drops must NOT be labelled "Delisted from store" — they were never in the store).
 *
 * `now` is injectable so time-based signals (recent release) are deterministic in tests.
 */

export type SignalType = "bullish" | "bearish" | "neutral" | "warning";

export interface Signal {
  label: string;
  description: string;
  type: SignalType;
  strength: number; // 1-3
}

const HIGH_RARITY = new Set(["legendary", "mythic", "exotic"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export function analyzeSignals(item: ItemDetailData, now: number = Date.now()): Signal[] {
  const signals: Signal[] = [];
  const price = item.currentPrice ?? 0;
  const change = item.priceChange24h ?? 0;
  const volume = item.volume ?? 0;
  const supply = item.totalSupply ?? 0;

  // 1. Price momentum (24h)
  if (change > 10) {
    signals.push({ label: "Strong upward momentum", description: `Price up ${change.toFixed(1)}% in 24h — significant bullish movement.`, type: "bullish", strength: 3 });
  } else if (change > 3) {
    signals.push({ label: "Positive momentum", description: `Price up ${change.toFixed(1)}% in 24h — mild upward trend.`, type: "bullish", strength: 1 });
  } else if (change < -10) {
    signals.push({ label: "Sharp decline", description: `Price down ${Math.abs(change).toFixed(1)}% in 24h — significant selling pressure.`, type: "bearish", strength: 3 });
  } else if (change < -3) {
    signals.push({ label: "Negative momentum", description: `Price down ${Math.abs(change).toFixed(1)}% in 24h — mild downward trend.`, type: "bearish", strength: 1 });
  }

  // 2. Short-term momentum (6h) — complements the 24h read.
  const c6 = item.priceChange6hPercent;
  if (c6 != null) {
    if (c6 > 8) {
      signals.push({ label: "6-hour surge", description: `Up ${c6.toFixed(1)}% in the last 6 hours — accelerating.`, type: "bullish", strength: 2 });
    } else if (c6 < -8) {
      signals.push({ label: "6-hour dip", description: `Down ${Math.abs(c6).toFixed(1)}% in the last 6 hours — near-term weakness.`, type: "bearish", strength: 2 });
    }
  }

  // 3. Supply scarcity (raw count)
  if (supply > 0 && supply < 100) {
    signals.push({ label: "Extremely scarce", description: `Only ${supply} total in existence. Scarcity drives value.`, type: "bullish", strength: 3 });
  } else if (supply > 0 && supply < 500) {
    signals.push({ label: "Low supply", description: `${supply.toLocaleString()} total supply — relatively rare item.`, type: "bullish", strength: 2 });
  } else if (supply > 10000) {
    signals.push({ label: "High supply", description: `${supply.toLocaleString()} total supply — common item, less scarcity premium.`, type: "bearish", strength: 1 });
  }

  // 4. Composite scarcity score (the site's own 0-100 metric) — only at the extremes.
  const scarcity = item.scarcityScore;
  if (scarcity != null) {
    if (scarcity >= 80) {
      signals.push({ label: "High scarcity score", description: `Scarcity score ${Math.round(scarcity)}/100 — distribution, liquidity, and supply all point scarce.`, type: "bullish", strength: 3 });
    } else if (scarcity <= 20) {
      signals.push({ label: "Low scarcity score", description: `Scarcity score ${Math.round(scarcity)}/100 — abundant and liquid.`, type: "bearish", strength: 1 });
    }
  }

  // 5. Listing pressure (volume = active sell listings)
  if (supply > 0 && volume > 0) {
    const listingRatio = volume / supply;
    if (listingRatio > 0.3) {
      signals.push({ label: "Heavy sell listings", description: `${(listingRatio * 100).toFixed(0)}% of supply is listed for sale — sellers outnumber holders.`, type: "bearish", strength: 2 });
    } else if (listingRatio < 0.05 && supply > 50) {
      signals.push({ label: "Holders are holding", description: `Only ${(listingRatio * 100).toFixed(1)}% of supply listed — low sell pressure.`, type: "bullish", strength: 2 });
    }
  }

  // 6. Sales velocity (liquidity) — 24h sales relative to supply.
  if (supply > 0 && item.soldPast24h != null) {
    const turnover = item.soldPast24h / supply;
    if (turnover > 0.05) {
      signals.push({ label: "Active trading", description: `${item.soldPast24h.toLocaleString()} sold in 24h (${(turnover * 100).toFixed(1)}% of supply) — liquid market.`, type: "neutral", strength: 1 });
    } else if (item.soldPast24h === 0 && supply > 50) {
      signals.push({ label: "Illiquid", description: "No sales in the last 24h — may be hard to buy or sell at the quoted price.", type: "warning", strength: 1 });
    }
  }

  // 7. Ownership concentration — many units per holder = whale-held.
  if (item.uniqueOwners && item.uniqueOwners > 0 && supply > 0) {
    const perOwner = supply / item.uniqueOwners;
    if (perOwner >= 3) {
      signals.push({ label: "Concentrated ownership", description: `~${perOwner.toFixed(1)} units per owner — a few holders control much of the supply.`, type: "warning", strength: 1 });
    }
  }

  // 8. Store origin / status — DROPS FIRST (a drop was never in the store, so it can't be
  // "delisted from store"; give it its own signal).
  if (item.isDroppableItem) {
    signals.push({
      label: "Item drop",
      description: item.droppedUnits
        ? `A random in-game drop (${item.droppedUnits.toLocaleString()} dropped) — never sold in the store, so supply is capped by the drop rate.`
        : "A random in-game drop — never sold in the store, so supply is capped by the drop rate.",
      type: "bullish",
      strength: 2,
    });
  } else if (item.storeStatus === "delisted") {
    signals.push({ label: "Delisted from store", description: "No longer purchasable from the S&box store. Supply is fixed — potential long-term value.", type: "bullish", strength: 2 });
  } else if (item.storeStatus === "available" && item.storePrice != null && price > 0) {
    if (price > item.storePrice * 1.5) {
      signals.push({ label: "Trading above store price", description: `Market price is ${((price / item.storePrice - 1) * 100).toFixed(0)}% above the store price of $${item.storePrice.toFixed(2)}.`, type: "warning", strength: 1 });
    } else if (price < item.storePrice * 0.8) {
      signals.push({ label: "Below store price", description: `Trading at a ${((1 - price / item.storePrice) * 100).toFixed(0)}% discount to the store price.`, type: "neutral", strength: 1 });
    }
  }

  // 9. High rarity tier (graded items only).
  if (item.rarity && HIGH_RARITY.has(item.rarity.toLowerCase())) {
    const tier = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1).toLowerCase();
    signals.push({ label: `${tier} rarity`, description: `Graded ${tier.toLowerCase()} — top-tier rarity that collectors seek.`, type: "bullish", strength: 2 });
  }

  // 10. Limited edition
  if (item.isLimited) {
    signals.push({ label: "Limited edition", description: "This item is marked as limited — no more will be created.", type: "bullish", strength: 2 });
  }

  // 11. Recently released — price still discovering.
  if (item.releaseDate) {
    const ageDays = (now - new Date(item.releaseDate).getTime()) / DAY_MS;
    if (ageDays >= 0 && ageDays <= 14) {
      signals.push({ label: "Recently released", description: "Released in the last two weeks — price is still finding its level.", type: "neutral", strength: 1 });
    }
  }

  // 12. Near all-time low / high (needs enough history).
  const prices = item.priceHistory.map((p) => p.price).filter((p) => p > 0);
  if (prices.length >= 10 && price > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min > 0 && price <= min * 1.05) {
      signals.push({ label: "Near all-time low", description: "Trading within 5% of its lowest recorded price.", type: "bullish", strength: 2 });
    } else if (max > 0 && price >= max * 0.95) {
      signals.push({ label: "Near all-time high", description: "Trading within 5% of its highest recorded price — historically stretched.", type: "warning", strength: 1 });
    }
  }

  // 13. Week-over-week trend (needs enough history)
  if (item.priceHistory.length >= 7) {
    const recent = item.priceHistory.slice(-7);
    const older = item.priceHistory.slice(-14, -7);
    if (older.length > 0) {
      const recentAvg = recent.reduce((s, p) => s + p.price, 0) / recent.length;
      const olderAvg = older.reduce((s, p) => s + p.price, 0) / older.length;
      const weekChange = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
      if (weekChange > 15) {
        signals.push({ label: "Weekly uptrend", description: `Average price up ${weekChange.toFixed(0)}% over the past week versus the prior week.`, type: "bullish", strength: 2 });
      } else if (weekChange < -15) {
        signals.push({ label: "Weekly downtrend", description: `Average price down ${Math.abs(weekChange).toFixed(0)}% over the past week versus the prior week.`, type: "bearish", strength: 2 });
      }
    }
  }

  return signals;
}

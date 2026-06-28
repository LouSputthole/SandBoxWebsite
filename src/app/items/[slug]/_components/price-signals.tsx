"use client";

import {
  AlertTriangle,
  Flame,
  Minus,
  ShieldCheck,
  Snowflake,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ItemDetailData } from "@/components/items/item-detail";

/**
 * Price Signals — bullish/bearish/neutral read on momentum, scarcity, listing
 * pressure, store status, limited status, and week-over-week trend, plus an
 * overall sentiment badge. Pure client derivation from data already on the
 * page (no fetch). Logic ported from the legacy price-signals.tsx; restyled to
 * the Arcade foundation tokens.
 */

type SignalType = "bullish" | "bearish" | "neutral" | "warning";

interface Signal {
  label: string;
  description: string;
  type: SignalType;
  strength: number; // 1-3
}

function analyzeSignals(item: ItemDetailData): Signal[] {
  const signals: Signal[] = [];
  const price = item.currentPrice ?? 0;
  const change = item.priceChange24h ?? 0;
  const volume = item.volume ?? 0;
  const supply = item.totalSupply ?? 0;

  // 1. Price momentum
  if (change > 10) {
    signals.push({
      label: "Strong upward momentum",
      description: `Price up ${change.toFixed(1)}% in 24h — significant bullish movement.`,
      type: "bullish",
      strength: 3,
    });
  } else if (change > 3) {
    signals.push({
      label: "Positive momentum",
      description: `Price up ${change.toFixed(1)}% in 24h — mild upward trend.`,
      type: "bullish",
      strength: 1,
    });
  } else if (change < -10) {
    signals.push({
      label: "Sharp decline",
      description: `Price down ${Math.abs(change).toFixed(1)}% in 24h — significant selling pressure.`,
      type: "bearish",
      strength: 3,
    });
  } else if (change < -3) {
    signals.push({
      label: "Negative momentum",
      description: `Price down ${Math.abs(change).toFixed(1)}% in 24h — mild downward trend.`,
      type: "bearish",
      strength: 1,
    });
  }

  // 2. Supply scarcity
  if (supply > 0 && supply < 100) {
    signals.push({
      label: "Extremely scarce",
      description: `Only ${supply} total in existence. Scarcity drives value.`,
      type: "bullish",
      strength: 3,
    });
  } else if (supply > 0 && supply < 500) {
    signals.push({
      label: "Low supply",
      description: `${supply.toLocaleString()} total supply — relatively rare item.`,
      type: "bullish",
      strength: 2,
    });
  } else if (supply > 10000) {
    signals.push({
      label: "High supply",
      description: `${supply.toLocaleString()} total supply — common item, less scarcity premium.`,
      type: "bearish",
      strength: 1,
    });
  }

  // 3. Listing pressure (volume = active sell listings)
  if (supply > 0 && volume > 0) {
    const listingRatio = volume / supply;
    if (listingRatio > 0.3) {
      signals.push({
        label: "Heavy sell listings",
        description: `${(listingRatio * 100).toFixed(0)}% of supply is listed for sale — sellers outnumber holders.`,
        type: "bearish",
        strength: 2,
      });
    } else if (listingRatio < 0.05 && supply > 50) {
      signals.push({
        label: "Holders are holding",
        description: `Only ${(listingRatio * 100).toFixed(1)}% of supply listed — low sell pressure.`,
        type: "bullish",
        strength: 2,
      });
    }
  }

  // 4. Store status
  if (item.storeStatus === "delisted") {
    signals.push({
      label: "Delisted from store",
      description:
        "No longer purchasable from the S&box store. Supply is fixed — potential long-term value.",
      type: "bullish",
      strength: 2,
    });
  } else if (
    item.storeStatus === "available" &&
    item.storePrice != null &&
    price > 0
  ) {
    if (price > item.storePrice * 1.5) {
      signals.push({
        label: "Trading above store price",
        description: `Market price is ${((price / item.storePrice - 1) * 100).toFixed(0)}% above the store price of $${item.storePrice.toFixed(2)}.`,
        type: "warning",
        strength: 1,
      });
    } else if (price < item.storePrice * 0.8) {
      signals.push({
        label: "Below store price",
        description: `Trading at a ${((1 - price / item.storePrice) * 100).toFixed(0)}% discount to the store price.`,
        type: "neutral",
        strength: 1,
      });
    }
  }

  // 5. Limited edition
  if (item.isLimited) {
    signals.push({
      label: "Limited edition",
      description: "This item is marked as limited — no more will be created.",
      type: "bullish",
      strength: 2,
    });
  }

  // 6. Week-over-week trend (needs enough history)
  if (item.priceHistory.length >= 7) {
    const recent = item.priceHistory.slice(-7);
    const older = item.priceHistory.slice(-14, -7);
    if (older.length > 0) {
      const recentAvg = recent.reduce((s, p) => s + p.price, 0) / recent.length;
      const olderAvg = older.reduce((s, p) => s + p.price, 0) / older.length;
      const weekChange =
        olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

      if (weekChange > 15) {
        signals.push({
          label: "Weekly uptrend",
          description: `Average price up ${weekChange.toFixed(0)}% over the past week versus the prior week.`,
          type: "bullish",
          strength: 2,
        });
      } else if (weekChange < -15) {
        signals.push({
          label: "Weekly downtrend",
          description: `Average price down ${Math.abs(weekChange).toFixed(0)}% over the past week versus the prior week.`,
          type: "bearish",
          strength: 2,
        });
      }
    }
  }

  return signals;
}

const iconMap = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
  warning: AlertTriangle,
} as const;

// Arcade signal colors (CSS vars so tints stay on-theme).
const signalColor: Record<SignalType, string> = {
  bullish: "var(--up)",
  bearish: "var(--down)",
  neutral: "var(--mut)",
  warning: "var(--cat-tool)",
};

export function PriceSignals({ item }: { item: ItemDetailData }) {
  const signals = analyzeSignals(item);

  if (signals.length === 0) return null;

  // Overall sentiment from net strength.
  const score = signals.reduce((s, sig) => {
    if (sig.type === "bullish") return s + sig.strength;
    if (sig.type === "bearish") return s - sig.strength;
    return s;
  }, 0);

  const sentiment =
    score >= 3
      ? { label: "Bullish", icon: Flame, color: "var(--up)" }
      : score <= -3
        ? { label: "Bearish", icon: Snowflake, color: "var(--down)" }
        : score > 0
          ? { label: "Slightly bullish", icon: ShieldCheck, color: "var(--up)" }
          : score < 0
            ? { label: "Slightly bearish", icon: AlertTriangle, color: "var(--down)" }
            : { label: "Neutral", icon: Minus, color: "var(--mut)" };

  const SentimentIcon = sentiment.icon;

  return (
    <div className="rounded-[18px] border border-line bg-panel p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-[18px] font-bold text-tx">
            Price signals
          </h2>
          <Tooltip
            asIcon
            content="Automated bullish/bearish reads derived from momentum, supply scarcity, listing pressure, and store status. Informational only — not financial advice."
          />
        </div>
        <div
          className="inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-[12px] font-bold"
          style={{
            color: sentiment.color,
            background: `color-mix(in srgb, ${sentiment.color} 14%, transparent)`,
          }}
        >
          <SentimentIcon className="h-3.5 w-3.5" />
          {sentiment.label}
        </div>
      </div>

      <div className="space-y-2">
        {signals.map((signal, i) => {
          const Icon = iconMap[signal.type];
          const color = signalColor[signal.type];
          return (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-[12px] border px-3 py-2.5"
              style={{
                borderColor: `color-mix(in srgb, ${color} 24%, transparent)`,
                background: `color-mix(in srgb, ${color} 6%, transparent)`,
              }}
            >
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color }}
              />
              <div>
                <div
                  className="text-[12.5px] font-bold"
                  style={{ color }}
                >
                  {signal.label}
                  {signal.strength >= 3 ? " !!!" : signal.strength === 2 ? " !!" : ""}
                </div>
                <p className="mt-0.5 text-[11.5px] text-faint">
                  {signal.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3.5 text-[10.5px] italic text-faint">
        Signals are informational only — not financial advice. Based on current
        market data and item properties.
      </p>
    </div>
  );
}

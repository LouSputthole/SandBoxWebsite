"use client";

import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ShieldCheck,
  Flame,
  Snowflake,
} from "lucide-react";
import type { ItemDetailData } from "./item-detail";

interface Signal {
  label: string;
  description: string;
  type: "bullish" | "bearish" | "neutral" | "warning";
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
      label: "Strong Upward Momentum",
      description: `Price up ${change.toFixed(1)}% in 24h — significant bullish movement.`,
      type: "bullish",
      strength: 3,
    });
  } else if (change > 3) {
    signals.push({
      label: "Positive Momentum",
      description: `Price up ${change.toFixed(1)}% in 24h — mild upward trend.`,
      type: "bullish",
      strength: 1,
    });
  } else if (change < -10) {
    signals.push({
      label: "Sharp Decline",
      description: `Price down ${Math.abs(change).toFixed(1)}% in 24h — significant selling pressure.`,
      type: "bearish",
      strength: 3,
    });
  } else if (change < -3) {
    signals.push({
      label: "Negative Momentum",
      description: `Price down ${Math.abs(change).toFixed(1)}% in 24h — mild downward trend.`,
      type: "bearish",
      strength: 1,
    });
  }

  // 2. Supply scarcity
  if (supply > 0 && supply < 100) {
    signals.push({
      label: "Extremely Scarce",
      description: `Only ${supply} total in existence. Scarcity drives value.`,
      type: "bullish",
      strength: 3,
    });
  } else if (supply > 0 && supply < 500) {
    signals.push({
      label: "Low Supply",
      description: `${supply.toLocaleString()} total supply — relatively rare item.`,
      type: "bullish",
      strength: 2,
    });
  } else if (supply > 10000) {
    signals.push({
      label: "High Supply",
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
        label: "Heavy Sell Listings",
        description: `${(listingRatio * 100).toFixed(0)}% of supply is listed for sale — sellers outnumber holders.`,
        type: "bearish",
        strength: 2,
      });
    } else if (listingRatio < 0.05 && supply > 50) {
      signals.push({
        label: "Holders Are Holding",
        description: `Only ${(listingRatio * 100).toFixed(1)}% of supply listed — low sell pressure.`,
        type: "bullish",
        strength: 2,
      });
    }
  }

  // 4. Store status
  if (item.storeStatus === "delisted") {
    signals.push({
      label: "Delisted from Store",
      description: "No longer purchasable from the S&box store. Supply is fixed — potential long-term value.",
      type: "bullish",
      strength: 2,
    });
  } else if (item.storeStatus === "available" && item.storePrice != null && price > 0) {
    if (price > item.storePrice * 1.5) {
      signals.push({
        label: "Trading Above Store Price",
        description: `Market price is ${((price / item.storePrice - 1) * 100).toFixed(0)}% above the store price of $${item.storePrice.toFixed(2)}.`,
        type: "warning",
        strength: 1,
      });
    } else if (price < item.storePrice * 0.8) {
      signals.push({
        label: "Below Store Price",
        description: `Trading at a ${((1 - price / item.storePrice) * 100).toFixed(0)}% discount to the store price.`,
        type: "neutral",
        strength: 1,
      });
    }
  }

  // 5. Limited edition
  if (item.isLimited) {
    signals.push({
      label: "Limited Edition",
      description: "This item is marked as limited — no more will be created.",
      type: "bullish",
      strength: 2,
    });
  }

  // 6. Price history trend (use price history if enough data)
  if (item.priceHistory.length >= 7) {
    const recent = item.priceHistory.slice(-7);
    const older = item.priceHistory.slice(-14, -7);
    if (older.length > 0) {
      const recentAvg =
        recent.reduce((s, p) => s + p.price, 0) / recent.length;
      const olderAvg =
        older.reduce((s, p) => s + p.price, 0) / older.length;
      const weekChange =
        olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

      if (weekChange > 15) {
        signals.push({
          label: "Weekly Uptrend",
          description: `Average price up ${weekChange.toFixed(0)}% over the past week versus the prior week.`,
          type: "bullish",
          strength: 2,
        });
      } else if (weekChange < -15) {
        signals.push({
          label: "Weekly Downtrend",
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
};

const colorMap = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  neutral: "text-neutral-400",
  warning: "text-amber-400",
};

const bgMap = {
  bullish: "bg-emerald-500/5 border-emerald-500/20",
  bearish: "bg-red-500/5 border-red-500/20",
  neutral: "bg-neutral-500/5 border-neutral-500/20",
  warning: "bg-amber-500/5 border-amber-500/20",
};

export function PriceSignals({ item }: { item: ItemDetailData }) {
  const signals = analyzeSignals(item);

  if (signals.length === 0) return null;

  // Calculate overall sentiment
  const score = signals.reduce((s, sig) => {
    if (sig.type === "bullish") return s + sig.strength;
    if (sig.type === "bearish") return s - sig.strength;
    return s;
  }, 0);

  const sentiment =
    score >= 3
      ? { label: "Bullish", icon: Flame, color: "text-emerald-400" }
      : score <= -3
        ? { label: "Bearish", icon: Snowflake, color: "text-red-400" }
        : score > 0
          ? { label: "Slightly Bullish", icon: ShieldCheck, color: "text-emerald-300" }
          : score < 0
            ? { label: "Slightly Bearish", icon: AlertTriangle, color: "text-red-300" }
            : { label: "Neutral", icon: Minus, color: "text-neutral-400" };

  const SentimentIcon = sentiment.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-300">Price Signals</h3>
        <div className={`flex items-center gap-1.5 text-xs font-medium ${sentiment.color}`}>
          <SentimentIcon className="h-3.5 w-3.5" />
          {sentiment.label}
        </div>
      </div>

      <div className="space-y-2">
        {signals.map((signal, i) => {
          const Icon = iconMap[signal.type];
          return (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${bgMap[signal.type]}`}
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${colorMap[signal.type]}`} />
              <div>
                <div className={`text-xs font-medium ${colorMap[signal.type]}`}>
                  {signal.label}
                  {signal.strength >= 3 && " !!!"}
                  {signal.strength === 2 && " !!"}
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {signal.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-neutral-600 italic">
        Signals are informational only — not financial advice. Based on current market data and item properties.
      </p>
    </div>
  );
}

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
import { analyzeSignals, type SignalType } from "@/lib/items/price-signals";

/**
 * Price Signals — bullish/bearish/neutral read on momentum, scarcity, listing pressure, sales
 * velocity, ownership concentration, store/drop origin, rarity, and trend, plus an overall
 * sentiment badge. The derivation lives in @/lib/items/price-signals (pure + unit-tested); this
 * component only renders it against the Arcade tokens.
 */


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

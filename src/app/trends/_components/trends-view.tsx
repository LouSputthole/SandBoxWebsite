"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import {
  AreaChartCard,
  TimeframeToggle,
  type Timeframe,
} from "@/components/charts";
import { StatCard } from "@/components/data";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { formatPrice, formatPriceChange } from "@/lib/utils";
import { rarityCssColor } from "@/lib/rarity";

/**
 * Arcade "Market trends" board. Everything below the nav lives in one client
 * subtree so the page-header timeframe toggle (7D / 30D / 90D) can drive the
 * market-cap area chart through shared local state — no server round-trip.
 *
 * The toggle slices the pre-loaded 90-day market-cap series client-side and
 * recomputes the chart's delta label. KPI cards, the category breakdown, and
 * the gainers / losers lists are period-independent (computed once on the
 * server) and render statically. All numbers are JetBrains Mono per the
 * Arcade type system; up/down green/red is reserved for price signals only.
 */

const TF_OPTIONS: Timeframe[] = ["7D", "30D", "90D"];
const TF_DAYS: Record<string, number> = { "7D": 7, "30D": 30, "90D": 90 };

export interface KpiVM {
  label: string;
  /** How to render the headline value. */
  format: "compact" | "price" | "number";
  /** Raw USD amount (compact / price) or count (number). */
  value: number;
  delta?: string;
  deltaPositive?: boolean;
  spark: number[];
}

export interface CategoryVM {
  type: string;
  label: string;
  /** CSS color (e.g. var(--cat-clothing)). */
  color: string;
  value: number;
  /** 0–100 share of total category value. */
  pct: number;
}

export interface MoverVM {
  name: string;
  slug: string;
  imageUrl: string | null;
  type: string;
  price: number | null;
  /** 24h price change, percent. */
  change: number;
  /** Steam-sourced rarity tint (hex, no leading #), when graded. */
  rarityColor?: string | null;
}

export interface MarketCapPoint {
  /** Epoch ms. */
  t: number;
  /** USD market cap. */
  v: number;
}

interface TrendsViewProps {
  kpis: KpiVM[];
  marketCap: { current: number; series: MarketCapPoint[] };
  categories: CategoryVM[];
  gainers: MoverVM[];
  losers: MoverVM[];
}

/** Abbreviated USD for big aggregates ($1.78M / $48.2K). Base USD — these are
 *  derived totals shown at a glance, not currency-converted like <Price>. */
function formatCompactUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function kpiValueNode(k: KpiVM) {
  if (k.format === "price") return <Price amount={k.value} />;
  if (k.format === "number") return k.value.toLocaleString();
  return formatCompactUsd(k.value);
}

function dateLabel(t: string | number) {
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function TrendsView({
  kpis,
  marketCap,
  categories,
  gainers,
  losers,
}: TrendsViewProps) {
  const [tf, setTf] = useState<Timeframe>("30D");

  // Slice the loaded 90-day series to the selected window and recompute the
  // delta. Falls back to the full series when the window is too sparse so the
  // chart never renders empty just because tracking started recently.
  const { series, delta, deltaPositive } = useMemo(() => {
    const all = marketCap.series;
    const cutoff = Date.now() - (TF_DAYS[tf] ?? 30) * 86_400_000;
    const windowed = all.filter((p) => p.t >= cutoff);
    const visible = windowed.length >= 2 ? windowed : all;

    let label: string | undefined;
    let positive = true;
    if (visible.length >= 2) {
      const first = visible[0].v;
      const last = visible[visible.length - 1].v;
      if (first > 0) {
        const pct = ((last - first) / first) * 100;
        positive = pct >= 0;
        label = `${positive ? "▲ +" : "▼ −"}${Math.abs(pct).toFixed(1)}%`;
      }
    }
    return { series: visible, delta: label, deltaPositive: positive };
  }, [marketCap.series, tf]);

  return (
    <div className="mx-auto max-w-[1240px] px-6 pb-12 pt-8">
      {/* Header + timeframe toggle */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[38px] font-extrabold leading-none tracking-[-.02em] text-tx">
            Market trends
          </h1>
          <p className="mt-2 text-[14.5px] text-mut">
            How the whole S&amp;box cosmetics economy is moving — recalculated
            on every sync.
          </p>
        </div>
        <TimeframeToggle value={tf} timeframes={TF_OPTIONS} onChange={setTf} />
      </div>

      {/* KPI cards with mini sparklines */}
      <div className="mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={kpiValueNode(k)}
            delta={k.delta}
            deltaPositive={k.deltaPositive}
            spark={k.spark}
          />
        ))}
      </div>

      {/* Market-cap area chart + category breakdown */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.55fr_1fr]">
        {series.length >= 2 ? (
          <AreaChartCard
            title="Total market cap"
            series={series}
            value={<Price amount={marketCap.current} />}
            delta={delta}
            deltaPositive={deltaPositive}
            height={230}
            valueFormatter={(v) => formatPrice(v)}
            labelFormatter={dateLabel}
          />
        ) : (
          <div className="rounded-[18px] border border-line bg-panel p-[22px]">
            <h2 className="m-0 font-display text-[18px] font-bold text-tx">
              Total market cap
            </h2>
            <div className="flex h-[230px] items-center justify-center text-center text-sm text-faint">
              No market-cap history yet. Snapshots are captured each sync cycle.
            </div>
          </div>
        )}

        <CategoryCard categories={categories} />
      </div>

      {/* Top gainers / losers */}
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <MoverPanel
          title="Top gainers"
          color="var(--up)"
          Icon={TrendingUp}
          items={gainers}
        />
        <MoverPanel
          title="Top losers"
          color="var(--down)"
          Icon={TrendingDown}
          items={losers}
        />
      </div>
    </div>
  );
}

function CategoryCard({ categories }: { categories: CategoryVM[] }) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-[22px]">
      <h2 className="m-0 mb-1 font-display text-[18px] font-bold text-tx">
        Market cap by category
      </h2>
      <p className="mb-[18px] text-[12.5px] text-faint">
        Where the value sits across the catalog.
      </p>
      {categories.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">
          No category data yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((c) => (
            <div key={c.type}>
              <div className="mb-[7px] flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-tx">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: c.color }}
                  />
                  {c.label}
                </span>
                <span className="font-mono text-[12.5px] text-mut">
                  {formatCompactUsd(c.value)}
                </span>
              </div>
              <div className="h-[9px] overflow-hidden rounded-[5px] bg-bg2">
                <div
                  className="h-full rounded-[5px]"
                  style={{
                    width: `${Math.max(c.pct, 1.5)}%`,
                    background: c.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoverPanel({
  title,
  color,
  Icon,
  items,
}: {
  title: string;
  color: string;
  Icon: LucideIcon;
  items: MoverVM[];
}) {
  return (
    <div className="rounded-[18px] border border-line bg-panel p-[18px]">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-[8px]"
          style={{
            background: `color-mix(in srgb, ${color} 16%, transparent)`,
            color,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="m-0 font-display text-[16px] font-bold" style={{ color }}>
          {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">
          No movers right now.
        </p>
      ) : (
        <div>
          {items.map((it) => (
            <MoverRow key={it.slug} item={it} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}

function MoverRow({ item, color }: { item: MoverVM; color: string }) {
  return (
    <Link
      href={`/items/${item.slug}`}
      className="flex items-center gap-3 rounded-[11px] p-2 transition-colors hover:bg-bg2"
    >
      <SkinTile
        imageUrl={item.imageUrl}
        name={item.name}
        type={item.type}
        rarityColor={rarityCssColor(item.rarityColor)}
        className="h-[38px] w-[38px] shrink-0 !rounded-[10px]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-tx">
          {item.name}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[13.5px] font-bold text-tx">
          {item.price != null ? <Price amount={item.price} /> : "—"}
        </span>
        <span
          className="font-mono text-[12px] font-bold"
          style={{ color }}
        >
          {formatPriceChange(item.change)}
        </span>
      </span>
    </Link>
  );
}

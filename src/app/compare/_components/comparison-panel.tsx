import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { Sparkline } from "@/components/charts";
import { Price } from "@/components/ui/price";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComparedItem } from "./metrics";

export interface ComparisonColumn {
  item: ComparedItem;
  /** /compare href with this column dropped (others preserved). */
  removeHref: string;
}

/** Grid template: sticky label column + one flexible column per skin. */
function template(n: number) {
  return { gridTemplateColumns: `170px repeat(${n}, minmax(0, 1fr))` };
}

function nums(xs: (number | null | undefined)[]): number[] {
  return xs.filter((x): x is number => x != null && Number.isFinite(x));
}

/** Mono numeric value cell; tinted accent when it's the best in its row. */
function ValueCell({
  children,
  accent = false,
  muted = false,
}: {
  children: ReactNode;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono text-sm",
        accent
          ? "font-bold text-[var(--accent)]"
          : muted
            ? "font-medium text-[var(--faint)]"
            : "font-semibold text-[var(--tx)]",
      )}
    >
      {children}
    </span>
  );
}

/** Signed percentage cell — green up / red down / muted flat, never accent. */
function PctCell({ v }: { v: number | null }) {
  if (v == null) return <ValueCell muted>—</ValueCell>;
  const color = v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "var(--mut)";
  return (
    <span className="font-mono text-sm font-semibold" style={{ color }}>
      {(v > 0 ? "+" : "") + v.toFixed(1) + "%"}
    </span>
  );
}

function Row({
  label,
  cols,
  children,
}: {
  label: string;
  cols: number;
  children: ReactNode[];
}) {
  return (
    <div
      style={template(cols)}
      className="group grid border-b border-[var(--line2)] transition-colors hover:bg-[var(--bg2)]"
    >
      <div className="sticky left-0 z-10 flex items-center bg-[var(--panel)] px-5 py-3.5 text-[13px] text-[var(--mut)] transition-colors group-hover:bg-[var(--bg2)]">
        {label}
      </div>
      {children.map((cell, i) => (
        <div
          key={i}
          className="flex items-center justify-center border-l border-[var(--line2)] px-4 py-3.5 text-center"
        >
          {cell}
        </div>
      ))}
    </div>
  );
}

/**
 * The Compare comparison table. Sticky first column of metric labels, then a
 * column per skin (tile + name + rarity badge + sparkline header). The best
 * value in price / supply / scarcity rows is tinted purple; change rows are
 * coloured by direction. Built as a CSS grid inside a horizontal-scroll frame
 * so 3–4 columns stay readable on narrow screens.
 */
export function ComparisonPanel({ columns }: { columns: ComparisonColumn[] }) {
  const items = columns.map((c) => c.item);
  const n = items.length;
  const showBest = n >= 2;

  const priceMax = nums(items.map((i) => i.currentPrice));
  const supplyMin = nums(items.map((i) => i.totalSupply));
  const scarcMax = nums(items.map((i) => i.scarcityScore));
  const bestPrice = priceMax.length ? Math.max(...priceMax) : null;
  const bestSupply = supplyMin.length ? Math.min(...supplyMin) : null; // rarer = better
  const bestScarc = scarcMax.length ? Math.max(...scarcMax) : null;

  const is = (v: number | null, best: number | null) =>
    showBest && v != null && best != null && v === best;

  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--panel)]">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 170 + n * 160 }}>
          {/* Column headers */}
          <div
            style={template(n)}
            className="grid border-b border-[var(--line)]"
          >
            <div className="sticky left-0 z-10 flex items-end bg-[var(--panel)] px-5 py-5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
                {n} skin{n === 1 ? "" : "s"}
              </span>
            </div>
            {columns.map(({ item, removeHref }) => {
              const dir = item.change7d ?? item.priceChange24h ?? 0;
              const sparkColor =
                dir > 0 ? "var(--up)" : dir < 0 ? "var(--down)" : "var(--mut)";
              return (
                <div
                  key={item.id}
                  className="relative border-l border-[var(--line2)] px-4 py-5 text-center"
                >
                  <Link
                    href={removeHref}
                    aria-label={`Remove ${item.name}`}
                    title="Remove"
                    className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[var(--faint)] transition-colors hover:bg-[var(--bg2)] hover:text-[var(--tx)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Link>

                  <SkinTile
                    imageUrl={item.imageUrl}
                    name={item.name}
                    type={item.type}
                    rarityColor={item.rarityTint}
                    iconSize="lg"
                    className="mx-auto w-[72px]"
                  />

                  <div className="mt-3 truncate font-sans text-[14.5px] font-bold text-[var(--tx)]">
                    {item.name}
                  </div>

                  <div className="mt-1.5">
                    {item.rarityName ? (
                      <span
                        className="inline-block rounded-[7px] px-2 py-[3px] font-mono text-[10.5px] font-bold uppercase tracking-wide"
                        style={{
                          color: item.rarityTint ?? "var(--mut)",
                          background: item.rarityTint
                            ? `color-mix(in srgb, ${item.rarityTint} 15%, transparent)`
                            : "var(--bg2)",
                        }}
                      >
                        {item.rarityName}
                      </span>
                    ) : (
                      <span className="inline-block rounded-[7px] bg-[var(--bg2)] px-2 py-[3px] font-mono text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
                        {item.category ?? item.type}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex justify-center">
                    <Sparkline
                      data={item.spark}
                      width={132}
                      height={26}
                      color={sparkColor}
                      strokeWidth={1.8}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Metric rows */}
          <Row label="Price" cols={n}>
            {items.map((i) => (
              <ValueCell key={i.id} accent={is(i.currentPrice, bestPrice)}>
                {i.currentPrice != null ? <Price amount={i.currentPrice} /> : "—"}
              </ValueCell>
            ))}
          </Row>
          <Row label="24h change" cols={n}>
            {items.map((i) => (
              <PctCell key={i.id} v={i.priceChange24h} />
            ))}
          </Row>
          <Row label="7d change" cols={n}>
            {items.map((i) => (
              <PctCell key={i.id} v={i.change7d} />
            ))}
          </Row>
          <Row label="30d change" cols={n}>
            {items.map((i) => (
              <PctCell key={i.id} v={i.change30d} />
            ))}
          </Row>
          <Row label="Total supply" cols={n}>
            {items.map((i) => (
              <ValueCell key={i.id} accent={is(i.totalSupply, bestSupply)}>
                {i.totalSupply != null ? i.totalSupply.toLocaleString() : "—"}
              </ValueCell>
            ))}
          </Row>
          <Row label="Unique owners" cols={n}>
            {items.map((i) => (
              <ValueCell key={i.id}>
                {i.uniqueOwners != null ? i.uniqueOwners.toLocaleString() : "—"}
              </ValueCell>
            ))}
          </Row>
          <Row label="On market" cols={n}>
            {items.map((i) => (
              <ValueCell key={i.id}>
                {i.supplyOnMarket != null
                  ? i.supplyOnMarket.toLocaleString()
                  : "—"}
              </ValueCell>
            ))}
          </Row>
          <Row label="Scarcity score" cols={n}>
            {items.map((i) => (
              <ValueCell key={i.id} accent={is(i.scarcityScore, bestScarc)}>
                {i.scarcityScore != null
                  ? `${Math.round(i.scarcityScore)} / 100`
                  : "—"}
              </ValueCell>
            ))}
          </Row>
          <Row label="Category" cols={n}>
            {items.map((i) => (
              <span
                key={i.id}
                className="font-sans text-sm capitalize text-[var(--mut)]"
              >
                {i.category ?? i.type}
              </span>
            ))}
          </Row>
          <Row label="Rarity" cols={n}>
            {items.map((i) =>
              i.rarityName ? (
                <span
                  key={i.id}
                  className="font-sans text-sm font-bold capitalize"
                  style={{ color: i.rarityTint ?? "var(--mut)" }}
                >
                  {i.rarityName}
                </span>
              ) : (
                <ValueCell key={i.id} muted>
                  —
                </ValueCell>
              ),
            )}
          </Row>

          {/* Actions */}
          <div style={template(n)} className="grid">
            <div className="sticky left-0 z-10 bg-[var(--panel)] px-5 py-4" />
            {items.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-center border-l border-[var(--line2)] px-4 py-4"
              >
                <Link
                  href={`/items/${i.slug}`}
                  className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                >
                  View skin
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

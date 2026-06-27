"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import {
  RankedTableShell,
  RankedHeaderRow,
  RankedHeadCell,
  RankedRow,
  RankedCell,
  RankBadge,
} from "@/components/data";
import { SkinTile } from "@/components/items/skin-tile";
import { Price } from "@/components/ui/price";
import { rarityCssColor } from "@/lib/rarity";
import { cn } from "@/lib/utils";
import { WhaleAvatar } from "./whale-avatar";

/**
 * Client-side Whales table. The server page builds the whale ranking (which
 * can't ship `cell`/`onClick` functions across the boundary), and this
 * component renders the Arcade ranked table from the shared primitives plus a
 * per-row expandable "Top items" breakdown held in local state. Each row toggles
 * a recessed detail panel showing up to 8 of the wallet's most valuable
 * holdings (skin tile + qty + value), a unique/total count, and links out to
 * the internal profile and the wallet's public Steam profile.
 */

export interface WhaleItem {
  name: string;
  slug: string;
  quantity: number;
  value: number;
  imageUrl: string | null;
  type: string;
  /** Raw Steam name_color (no '#'); resolved to CSS here. */
  rarityColor: string | null;
}

export interface Whale {
  steamId: string;
  name: string;
  /** Real Steam avatar URL (may be empty — falls back to a gradient avatar). */
  avatarUrl: string | null;
  /** Up to 8 most valuable holdings for the expandable breakdown. */
  items: WhaleItem[];
  totalValue: number;
  totalQuantity: number;
  uniqueItems: number;
  /** Value-weighted 24h price change across the wallet's holdings (%). */
  change24h: number;
  /** Name of the wallet's single most valuable holding. */
  topHolding: string;
}

// rank · wallet · holdings · items · 24h · expand chevron
const GRID = "56px minmax(0,1fr) 150px 90px 120px 34px";

function changeColor(change: number): string {
  if (change > 0) return "var(--up)";
  if (change < 0) return "var(--down)";
  return "var(--mut)";
}

export function WhalesTable({ whales }: { whales: Whale[] }) {
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <RankedTableShell>
      <RankedHeaderRow gridTemplate={GRID}>
        <RankedHeadCell align="left">Rank</RankedHeadCell>
        <RankedHeadCell align="left">Wallet</RankedHeadCell>
        <RankedHeadCell align="right">Holdings</RankedHeadCell>
        <RankedHeadCell align="right">Items</RankedHeadCell>
        <RankedHeadCell align="right">24h</RankedHeadCell>
        <RankedHeadCell align="right" />
      </RankedHeaderRow>

      {whales.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-mut">
          No whale data yet. Check back after the next sync.
        </div>
      ) : (
        whales.map((w, i) => {
          const expanded = open.has(w.steamId);
          return (
            <React.Fragment key={w.steamId}>
              <RankedRow
                gridTemplate={GRID}
                onClick={() => toggle(w.steamId)}
                className="cursor-pointer"
              >
                <RankedCell align="left">
                  <RankBadge rank={i + 1} />
                </RankedCell>

                <RankedCell align="left">
                  <div className="flex min-w-0 items-center gap-[13px]">
                    <WhaleAvatar
                      avatarUrl={w.avatarUrl}
                      steamId={w.steamId}
                      name={w.name}
                    />
                    <div className="min-w-0">
                      <span className="block truncate text-[14.5px] font-bold text-tx">
                        {w.name}
                      </span>
                      {w.topHolding && (
                        <span className="block truncate text-[11.5px] text-faint">
                          top: {w.topHolding}
                        </span>
                      )}
                    </div>
                  </div>
                </RankedCell>

                <RankedCell
                  align="right"
                  mono
                  className="text-[15px] font-bold text-tx"
                >
                  <Price amount={w.totalValue} />
                </RankedCell>

                <RankedCell align="right" mono className="text-[13px] text-mut">
                  {w.totalQuantity.toLocaleString()}
                </RankedCell>

                <RankedCell align="right" mono className="text-[13px]">
                  <span style={{ color: changeColor(w.change24h) }}>
                    {(w.change24h > 0 ? "+" : "") + w.change24h.toFixed(1) + "%"}
                  </span>
                </RankedCell>

                <RankedCell align="right">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} ${w.name}'s top items`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(w.steamId);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] text-faint transition-colors hover:bg-bg2 hover:text-tx"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expanded && "rotate-180"
                      )}
                    />
                  </button>
                </RankedCell>
              </RankedRow>

              {expanded && (
                <div className="border-b border-line2 bg-bg px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[.4px] text-faint">
                      Top items · {w.uniqueItems.toLocaleString()} unique ·{" "}
                      {w.totalQuantity.toLocaleString()} total
                    </span>
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/u/${w.steamId}`}
                        className="text-[11.5px] text-accent hover:underline"
                      >
                        View profile
                      </Link>
                      <a
                        href={`https://steamcommunity.com/profiles/${w.steamId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                      >
                        Steam profile
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  <div className="grid gap-1 sm:grid-cols-2">
                    {w.items.map((it) => (
                      <Link
                        key={it.slug}
                        href={`/items/${it.slug}`}
                        className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-bg2"
                      >
                        <SkinTile
                          imageUrl={it.imageUrl}
                          name={it.name}
                          type={it.type}
                          rarityColor={rarityCssColor(it.rarityColor)}
                          className="h-9 w-9 shrink-0 !rounded-[10px]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-tx">
                          {it.name}
                        </span>
                        <span className="shrink-0 font-mono text-[12.5px] text-mut">
                          {it.quantity}× · <Price amount={it.value} />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })
      )}
    </RankedTableShell>
  );
}

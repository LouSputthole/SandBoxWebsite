import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Coins, MessageCircle } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { buttonVariants } from "@/components/ui/button";
import { rarityCssColor } from "@/lib/rarity";
import { cn, formatPrice } from "@/lib/utils";

/** One item on either side of a listing (catalog item or free-text custom). */
export interface OfferItem {
  id: string;
  slot: string; // "offering" | "wanting"
  customName: string | null;
  quantity: number;
  unitPriceAtListing: number | null;
  item: {
    name: string;
    imageUrl: string | null;
    type: string;
    currentPrice: number | null;
    rarityColor: string | null;
  } | null;
}

/** A single trade listing, shaped for the board card. */
export interface OfferListing {
  id: string;
  side: string; // "selling" | "buying" | "both"
  description: string;
  createdAt: string; // ISO
  replies: number;
  user: { username: string | null; avatarUrl: string | null; steamId: string };
  items: OfferItem[];
}

// WTS/WTB/WTT badge — color-coded per the Arcade mockup: selling = green (up),
// buying = rare blue, trading = brand purple. Color drives both the text and a
// 16%-tinted background via color-mix.
const SIDE_META: Record<string, { label: string; color: string }> = {
  selling: { label: "WTS", color: "var(--up)" },
  buying: { label: "WTB", color: "var(--rarity-rare)" },
  both: { label: "WTT", color: "var(--accent)" },
};

// How many item rows to show per side before collapsing into "+N more" — keeps
// card heights bounded so the 2-col board scans cleanly.
const MAX_ROWS = 3;

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.split(/[_\s]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase() || "?";
}

function priceLabel(li: OfferItem): string | null {
  const p = li.unitPriceAtListing ?? li.item?.currentPrice ?? null;
  return p != null ? formatPrice(p) : null;
}

/** One offering/wanting row: small skin tile (or cash glyph) + name + price. */
function ItemRow({ li }: { li: OfferItem }) {
  const name = li.item?.name ?? li.customName ?? "Item";
  const price = priceLabel(li);
  return (
    <div className="flex items-center gap-[9px]">
      {li.item ? (
        <SkinTile
          imageUrl={li.item.imageUrl}
          name={li.item.name}
          type={li.item.type}
          rarityColor={rarityCssColor(li.item.rarityColor)}
          className="h-[34px] w-[34px] shrink-0 !rounded-[9px]"
        />
      ) : (
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line bg-panel2 text-faint">
          <Coins className="h-[17px] w-[17px]" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-tx">
          {name}
          {li.quantity > 1 ? ` ×${li.quantity}` : ""}
        </span>
        {price && (
          <span className="font-mono text-[11px] text-mut">{price}</span>
        )}
      </span>
    </div>
  );
}

/** A side's content: stacked item rows (capped) or a free-text fallback. */
function SideContent({
  items,
  fallback,
}: {
  items: OfferItem[];
  fallback: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[12px] leading-snug text-faint line-clamp-3">
        {fallback}
      </p>
    );
  }
  const visible = items.slice(0, MAX_ROWS);
  const more = items.length - visible.length;
  // Σ(unit price × qty) for this side — listing-time price if captured, else the
  // item's current price. Skipped when nothing on the side carries a price.
  const estValue = items.reduce((sum, li) => {
    const unit = li.unitPriceAtListing ?? li.item?.currentPrice ?? 0;
    return sum + unit * li.quantity;
  }, 0);
  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((li) => (
        <ItemRow key={li.id} li={li} />
      ))}
      {more > 0 && (
        <span className="text-[11px] text-faint">+{more} more</span>
      )}
      {estValue > 0 && (
        <span className="mt-0.5 font-mono text-[12px] font-semibold text-tx">
          {formatPrice(estValue)}
          <span className="ml-1 font-sans text-[10px] font-normal text-faint">
            est.
          </span>
        </span>
      )}
    </div>
  );
}

function ColumnLabel({ children }: { children: string }) {
  return (
    <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[.4px] text-faint">
      {children}
    </div>
  );
}

/**
 * One offer card on the Arcade trading board: trader (avatar + age + replies),
 * a color-coded WTS/WTB/WTT badge, an offering → looking-for layout built from
 * the listing's real items, and Make-offer / Message actions into the listing
 * detail page. One-sided listings (sell wants cash, buy pays cash) surface the
 * listing description in the empty column so the asking terms still show.
 */
export function OfferCard({ listing }: { listing: OfferListing }) {
  const meta = SIDE_META[listing.side] ?? {
    label: listing.side.toUpperCase(),
    color: "var(--accent)",
  };
  const offering = listing.items.filter((i) => i.slot === "offering");
  const wanting = listing.items.filter((i) => i.slot === "wanting");
  const desc = listing.description.trim();
  const bothEmpty = offering.length === 0 && wanting.length === 0;

  const badgeStyle: CSSProperties = {
    color: meta.color,
    background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
  };

  return (
    <div className="rounded-[18px] border border-line bg-panel p-[18px] transition-colors hover:[border-color:#3a3547]">
      {/* trader */}
      <div className="mb-[15px] flex items-center gap-[11px]">
        {listing.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.user.avatarUrl}
            alt=""
            className="h-[38px] w-[38px] shrink-0 rounded-[11px] border border-line object-cover"
          />
        ) : (
          <span
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] font-display text-[14px] font-extrabold text-white"
            style={{
              background: "linear-gradient(140deg, var(--accent), var(--accent2))",
            }}
          >
            {initials(listing.user.username)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-tx">
            {listing.user.username ?? "Anonymous"}
          </div>
          <div className="text-[11.5px] text-faint">
            {timeAgo(listing.createdAt)} · {listing.replies}{" "}
            {listing.replies === 1 ? "reply" : "replies"}
          </div>
        </div>
        <span
          className="shrink-0 rounded-[8px] px-2.5 py-1 text-[11px] font-extrabold tracking-[.4px]"
          style={badgeStyle}
        >
          {meta.label}
        </span>
      </div>

      {/* offering → looking for */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ColumnLabel>Offering</ColumnLabel>
          <SideContent
            items={offering}
            fallback={bothEmpty ? "Open offer" : desc || "Cash / offers"}
          />
        </div>
        <ArrowRight className="h-[22px] w-[22px] shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <ColumnLabel>Looking for</ColumnLabel>
          <SideContent
            items={wanting}
            fallback={desc || "Open to offers"}
          />
        </div>
      </div>

      {/* actions */}
      <div className="mt-4 flex gap-2.5">
        <Link
          href={`/trade/${listing.id}`}
          className={cn(buttonVariants(), "flex-1 rounded-[11px]")}
        >
          Make offer
        </Link>
        <Link
          href={`/trade/${listing.id}#comments`}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "gap-1.5 rounded-[11px] text-mut hover:text-tx"
          )}
        >
          <MessageCircle className="h-4 w-4" />
          Message
        </Link>
      </div>
    </div>
  );
}

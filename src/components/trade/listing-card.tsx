import Link from "next/link";
import { ItemImage } from "@/components/items/item-image";
import { formatPrice } from "@/lib/utils";

/**
 * Item-grid + value summary for one side of a listing card. Handles both
 * catalog items (with thumbnail) and free-text custom items. Truncates the
 * grid past 9 items and shows "+N more" — keeps card heights bounded so
 * the feed scans cleanly.
 */
function SideBlock({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "offering" | "wanting";
  items: ListingItem[];
}) {
  const SHOW = 9;
  const visible = items.slice(0, SHOW);
  const more = items.length - visible.length;
  const totalValue = items.reduce((sum, li) => {
    const price = li.unitPriceAtListing ?? li.item?.currentPrice ?? 0;
    return sum + price * li.quantity;
  }, 0);

  const labelTone =
    tone === "offering" ? "text-emerald-400" : "text-blue-400";

  return (
    <div className="rounded-lg bg-neutral-950/50 border border-neutral-800 p-3 flex flex-col">
      <div className={`text-[11px] uppercase tracking-wider font-semibold ${labelTone} mb-2`}>
        {label}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-600 italic flex-1">See description</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-2 flex-1 content-start">
            {visible.map((li) => (
              <div
                key={li.id}
                className="relative aspect-square rounded-md bg-neutral-900 border border-neutral-800 overflow-hidden"
                title={
                  li.item
                    ? `${li.item.name}${li.quantity > 1 ? ` ×${li.quantity}` : ""}`
                    : `${li.customName}${li.quantity > 1 ? ` ×${li.quantity}` : ""}`
                }
              >
                {li.item ? (
                  <ItemImage
                    src={li.item.imageUrl}
                    name={li.item.name}
                    type={li.item.type}
                    size="sm"
                    className="h-full w-full"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[10px] text-neutral-400 text-center px-1 leading-tight">
                    {li.customName}
                  </div>
                )}
                {li.quantity > 1 && (
                  <span className="absolute top-0.5 right-0.5 text-[9px] font-semibold bg-black/70 text-white px-1 py-0.5 rounded">
                    ×{li.quantity}
                  </span>
                )}
              </div>
            ))}
          </div>
          {more > 0 && (
            <div className="text-[10px] text-neutral-500 mb-1">+{more} more</div>
          )}
          {totalValue > 0 && (
            <div className="text-sm font-semibold text-white">
              {formatPrice(totalValue)}
              <span className="text-[10px] text-neutral-500 font-normal ml-1">est.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ListingItem {
  id: string;
  slot: string;
  itemId: string | null;
  customName: string | null;
  quantity: number;
  unitPriceAtListing: number | null;
  item: {
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    type: string;
    currentPrice: number | null;
  } | null;
}

export interface TradeListingCardProps {
  id: string;
  side: string;
  description: string;
  createdAt: string; // ISO
  user: { steamId: string; username: string | null; avatarUrl: string | null };
  items: ListingItem[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const SIDE_LABEL: Record<string, string> = {
  selling: "SELLING",
  buying: "BUYING",
  both: "TRADE",
};

const SIDE_TONE: Record<string, string> = {
  selling: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  buying: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  both: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

/**
 * One row in the trade-feed list. Renders both sides regardless of `side`
 * field — sboxcharts pattern. The side badge tells the eye what to focus on.
 */
export function TradeListingCard(props: TradeListingCardProps) {
  const offering = props.items.filter((i) => i.slot === "offering");
  const wanting = props.items.filter((i) => i.slot === "wanting");
  const sideLabel = SIDE_LABEL[props.side] ?? props.side.toUpperCase();
  const sideTone = SIDE_TONE[props.side] ?? "bg-neutral-800 text-neutral-300 border-neutral-700";

  return (
    <Link
      href={`/trade/${props.id}`}
      className="block rounded-xl border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 hover:bg-neutral-900/90 transition-colors p-4"
    >
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {props.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.user.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full border border-neutral-700"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-neutral-800" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {props.user.username ?? "Anonymous"}
            </div>
            <div className="text-[10px] text-neutral-500">{timeAgo(props.createdAt)}</div>
          </div>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold border ${sideTone} shrink-0`}
        >
          {sideLabel}
        </span>
      </div>
      {props.description && (
        <div className="rounded-lg bg-neutral-950/40 border border-neutral-800/60 px-3 py-2 mb-3">
          <p className="text-sm text-neutral-200 whitespace-pre-wrap line-clamp-3">
            {props.description}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
        <SideBlock label="Have" tone="offering" items={offering} />
        <div className="hidden sm:flex items-center justify-center text-neutral-600">→</div>
        <SideBlock label="Want" tone="wanting" items={wanting} />
      </div>
    </Link>
  );
}

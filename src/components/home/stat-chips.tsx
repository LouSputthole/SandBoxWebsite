import { BarChart3, Clock, DollarSign, List, Package, type LucideIcon } from "lucide-react";
import { Price } from "@/components/ui/price";
import { formatRelativeTime } from "@/lib/utils";

interface StatChipsProps {
  stats: {
    estMarketCap: number;
    avgPrice: number;
    totalListings: number;
    totalItems: number;
    /** How many tracked items had known supply behind the market-cap figure. */
    estMarketCapItemCount: number;
    /** ISO timestamp of the most recently synced item, or null. */
    lastUpdated: string | null;
  };
}

interface Chip {
  label: string;
  /** Optional faint coverage caption appended after the label (e.g. "· 83/103"). */
  sub?: string;
  value: React.ReactNode;
  color: string;
  Icon: LucideIcon;
}

/**
 * The four horizontal KPI chips below the hero — icon tile + mono value +
 * faint label. Numbers are JetBrains Mono per the Arcade type system; icon
 * tints follow the mockup (accent / up / rare-blue / legendary).
 */
export function StatChips({ stats }: StatChipsProps) {
  // Market cap is computed only from items with known supply; when that's a
  // subset of the catalog, surface the "N/total" coverage so the figure reads
  // honestly rather than as whole-catalog cap.
  const showCapCoverage =
    stats.estMarketCap > 0 && stats.estMarketCapItemCount < stats.totalItems;

  const chips: Chip[] = [
    {
      label: "Market cap",
      sub: showCapCoverage
        ? `· ${stats.estMarketCapItemCount}/${stats.totalItems}`
        : undefined,
      value: stats.estMarketCap > 0 ? <Price amount={stats.estMarketCap} /> : "—",
      color: "var(--accent)",
      Icon: BarChart3,
    },
    {
      label: "Avg price",
      value: <Price amount={stats.avgPrice} />,
      color: "var(--up)",
      Icon: DollarSign,
    },
    {
      label: "Active listings",
      value: stats.totalListings.toLocaleString(),
      color: "var(--rarity-rare)",
      Icon: List,
    },
    {
      label: "Tracked skins",
      value: stats.totalItems.toLocaleString(),
      color: "var(--rarity-legendary)",
      Icon: Package,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {chips.map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-3 rounded-[16px] border border-line bg-panel px-[18px] py-4"
          >
            <span
              className="inline-flex shrink-0 rounded-[12px] p-2.5"
              style={{
                background: `color-mix(in srgb, ${c.color} 16%, transparent)`,
                color: c.color,
              }}
            >
              <c.Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[21px] font-bold leading-tight tracking-[-.4px] text-tx">
                {c.value}
              </div>
              <div className="text-[12.5px] text-faint">
                {c.label}
                {c.sub && <span className="opacity-70"> {c.sub}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {stats.lastUpdated && (
        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          <Clock className="h-3 w-3" />
          <span>Data last updated {formatRelativeTime(stats.lastUpdated)}</span>
        </div>
      )}
    </div>
  );
}

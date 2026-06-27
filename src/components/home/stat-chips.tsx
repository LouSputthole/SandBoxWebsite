import { BarChart3, DollarSign, List, Package, type LucideIcon } from "lucide-react";
import { Price } from "@/components/ui/price";

interface StatChipsProps {
  stats: {
    estMarketCap: number;
    avgPrice: number;
    totalListings: number;
    totalItems: number;
  };
}

interface Chip {
  label: string;
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
  const chips: Chip[] = [
    {
      label: "Market cap",
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
            <div className="text-[12.5px] text-faint">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

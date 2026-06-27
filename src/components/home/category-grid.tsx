import type { CSSProperties } from "react";
import Link from "next/link";
import { Shirt, Gem, User, Sword, Wrench, type LucideIcon } from "lucide-react";

interface Category {
  type: string;
  label: string;
  color: string;
  blurb: string;
  Icon: LucideIcon;
}

const CATEGORIES: Category[] = [
  { type: "clothing", label: "Clothing", color: "var(--cat-clothing)", blurb: "Outfits, tops, shoes", Icon: Shirt },
  { type: "accessory", label: "Accessories", color: "var(--cat-accessory)", blurb: "Hats, masks, glasses", Icon: Gem },
  { type: "character", label: "Characters", color: "var(--cat-character)", blurb: "Full character skins", Icon: User },
  { type: "weapon", label: "Weapons", color: "var(--cat-weapon)", blurb: "Weapon reskins", Icon: Sword },
  { type: "tool", label: "Tools", color: "var(--cat-tool)", blurb: "Tool reskins", Icon: Wrench },
];

/**
 * Browse-by-category cards, color-coded by the Arcade category accents. Only
 * categories with at least one tracked skin are shown; counts come from the
 * homepage's category tally.
 */
export function CategoryGrid({ counts }: { counts: Record<string, number> }) {
  const cats = CATEGORIES.filter((c) => (counts[c.type] ?? 0) > 0);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cats.map((c) => (
        <Link
          key={c.type}
          href={`/items/type/${c.type}`}
          style={{ "--cc": c.color } as CSSProperties}
          className="group relative overflow-hidden rounded-[20px] border border-line bg-panel p-5 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--cc)_50%,var(--line))]"
        >
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-[120px] w-[120px] rounded-full"
            aria-hidden
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, ${c.color} 26%, transparent), transparent 65%)`,
            }}
          />
          <span
            className="relative mb-3.5 inline-flex rounded-[13px] p-2.5"
            style={{
              background: `color-mix(in srgb, ${c.color} 16%, transparent)`,
              color: c.color,
            }}
          >
            <c.Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
          </span>
          <div className="relative font-display text-[17px] font-bold text-tx">
            {c.label}{" "}
            <span className="font-mono text-[14px] font-semibold text-faint">
              {counts[c.type]}
            </span>
          </div>
          <div className="relative mt-0.5 text-[12.5px] text-mut">{c.blurb}</div>
        </Link>
      ))}
    </div>
  );
}

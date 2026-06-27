import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Eye, LineChart, Star, Trophy, type LucideIcon } from "lucide-react";

interface Feature {
  href: string;
  title: string;
  blurb: string;
  /** Arcade accent color the card tints toward on hover + icon tile. */
  color: string;
  Icon: LucideIcon;
}

const FEATURES: Feature[] = [
  {
    href: "/trends",
    title: "Market Trends",
    blurb: "Charts, top movers, and type breakdown across 7, 30, or 90 days.",
    color: "var(--accent)",
    Icon: LineChart,
  },
  {
    href: "/leaderboard",
    title: "Leaderboard",
    blurb: "Most valuable, biggest gainers, and most-listed S&box skins.",
    color: "var(--cat-tool)",
    Icon: Trophy,
  },
  {
    href: "/inventory",
    title: "Inventory Checker",
    blurb: "Estimate the total value of any Steam user's sbox inventory.",
    color: "var(--rarity-rare)",
    Icon: Eye,
  },
  {
    href: "/portfolio",
    title: "Your Watchlist",
    blurb: "Track the skins you care about and monitor their market value.",
    color: "var(--up)",
    Icon: Star,
  },
];

/**
 * Four promo cards cross-linking the site's main tools (Trends, Leaderboard,
 * Inventory, Watchlist). Mirrors the Arcade CategoryGrid card treatment —
 * hairline panel, glow corner, tinted icon tile, hover lift toward the
 * feature's accent color.
 */
export function FeaturesGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((f) => (
        <Link
          key={f.href}
          href={f.href}
          style={{ "--fc": f.color } as CSSProperties}
          className="group relative overflow-hidden rounded-[18px] border border-line bg-panel p-5 transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--fc)_50%,var(--line))]"
        >
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-[120px] w-[120px] rounded-full"
            aria-hidden
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, ${f.color} 22%, transparent), transparent 65%)`,
            }}
          />
          <span
            className="relative mb-3.5 inline-flex rounded-[13px] p-2.5"
            style={{
              background: `color-mix(in srgb, ${f.color} 16%, transparent)`,
              color: f.color,
            }}
          >
            <f.Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
          </span>
          <div className="relative font-display text-[17px] font-bold text-tx">
            {f.title}
          </div>
          <div className="relative mt-1 text-[12.5px] leading-snug text-mut">
            {f.blurb}
          </div>
          <ArrowRight className="absolute right-5 top-5 h-4 w-4 text-faint transition-colors group-hover:text-tx" />
        </Link>
      ))}
    </div>
  );
}

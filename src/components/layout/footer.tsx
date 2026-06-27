import Link from "next/link";

const browseLinks = [
  { label: "All Skins", href: "/items" },
  { label: "New Drops", href: "/new" },
  { label: "Clothing", href: "/items/type/clothing" },
  { label: "Accessories", href: "/items/type/accessory" },
  { label: "Characters", href: "/items/type/character" },
  { label: "Market Trends", href: "/trends" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Whales", href: "/whales" },
  { label: "Compare Skins", href: "/compare" },
];

const toolsLinks: { label: string; href: string; external?: boolean }[] = [
  { label: "Trading Board", href: "/trade" },
  { label: "Inventory Checker", href: "/inventory" },
  { label: "Watchlist", href: "/portfolio" },
  { label: "Market Reports", href: "/blog" },
  { label: "Export Data (CSV)", href: "/api/export", external: true },
];

const infoLinks = [
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Claude Bridge", href: "/claudebridge" },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  return (
    <div>
      <div className="mb-[13px] text-xs font-bold uppercase tracking-[0.4px] text-[var(--faint)]">
        {title}
      </div>
      <div className="flex flex-col gap-[10px] text-[13.5px] text-[var(--mut)]">
        {links.map((l) =>
          l.external ? (
            <a
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-[var(--tx)]"
            >
              {l.label}
            </a>
          ) : (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-[var(--tx)]"
            >
              {l.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-[var(--bg)]">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-8 px-6 pb-7 pt-[42px] md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        {/* Brand blurb */}
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="mb-3 flex items-center gap-[10px]">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] font-display text-sm font-extrabold text-white"
              style={{
                background: "linear-gradient(140deg, var(--accent), var(--accent2))",
              }}
            >
              S&amp;
            </span>
            <span className="font-display text-[17px] font-extrabold text-[var(--tx)]">
              sboxskins<span className="font-semibold text-[var(--faint)]">.gg</span>
            </span>
          </Link>
          <p className="m-0 max-w-[280px] text-[13px] leading-[1.6] text-[var(--faint)]">
            The dedicated S&box cosmetics market tracker. Live prices, drops and
            supply for every sbox skin on the Steam Community Market.
          </p>
        </div>

        <FooterColumn title="Browse" links={browseLinks} />
        <FooterColumn title="Tools" links={toolsLinks} />
        <FooterColumn title="Info" links={infoLinks} />
      </div>

      <div className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-[10px] px-6 py-[18px]">
          <p className="m-0 text-[11.5px] text-[var(--faint)]">
            Not affiliated with Facepunch Studios or Valve Corporation. S&box is
            a trademark of Facepunch Studios. Market data may be delayed.
          </p>
          <p className="m-0 font-mono text-[11.5px] text-[var(--faint)]">
            © 2026 sboxskins.gg
          </p>
        </div>
      </div>
    </footer>
  );
}

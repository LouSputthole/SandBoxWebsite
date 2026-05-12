import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { PARTNER, partnerUrl } from "@/lib/partner/config";

export function Footer() {
  return (
    <footer className="border-t border-neutral-800 bg-[#0a0a0f] mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {PARTNER.enabled && (
          // Partner callout — single source of truth in lib/partner/
          // config.ts, so when the Hub confirms their assets we update
          // one file and every surface updates with it.
          <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-transparent p-4 sm:p-5 mb-8 flex items-center gap-4 flex-wrap">
            <div
              className="flex items-center justify-center h-12 w-12 rounded-lg bg-neutral-900 border border-neutral-800 shrink-0"
              style={{ color: PARTNER.brandColor }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={PARTNER.logoSrc}
                alt={PARTNER.logoAlt}
                className="h-7 w-7"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold">
                Trading Partner
              </p>
              <p className="text-sm font-semibold text-white">{PARTNER.name}</p>
              <p className="text-xs text-neutral-400 leading-relaxed mt-0.5">
                Coordinate trades in person at the in-game Trading Hub. Discord
                community + dedicated meet-up area for S&amp;box traders.
              </p>
            </div>
            <a
              href={partnerUrl("footer")}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-purple-200 hover:text-white border border-purple-500/30 rounded-md px-3 py-2 transition-colors shrink-0"
            >
              Join the Hub →
            </a>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Browse</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/items" className="text-neutral-500 hover:text-white transition-colors">All Skins</Link></li>
              <li><Link href="/leaderboard" className="text-neutral-500 hover:text-white transition-colors">Leaderboard</Link></li>
              <li><Link href="/whales" className="text-neutral-500 hover:text-white transition-colors">Whales</Link></li>
              <li><Link href="/compare" className="text-neutral-500 hover:text-white transition-colors">Compare Skins</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">By Type</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/items/type/clothing" className="text-neutral-500 hover:text-white transition-colors">Clothing</Link></li>
              <li><Link href="/items/type/accessory" className="text-neutral-500 hover:text-white transition-colors">Accessories</Link></li>
              <li><Link href="/items/type/character" className="text-neutral-500 hover:text-white transition-colors">Characters</Link></li>
              <li><Link href="/trends" className="text-neutral-500 hover:text-white transition-colors">Market Trends</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Tools</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/trade" className="text-neutral-500 hover:text-white transition-colors">Trading Board</Link></li>
              <li><Link href="/inventory" className="text-neutral-500 hover:text-white transition-colors">Inventory Checker</Link></li>
              <li><Link href="/portfolio" className="text-neutral-500 hover:text-white transition-colors">Watchlist</Link></li>
              <li><Link href="/blog" className="text-neutral-500 hover:text-white transition-colors">Market Reports</Link></li>
              <li><a href="/api/export" className="text-neutral-500 hover:text-white transition-colors">Export Data (CSV)</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Info</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/faq" className="text-neutral-500 hover:text-white transition-colors">FAQ</Link></li>
              <li><Link href="/contact" className="text-neutral-500 hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-semibold text-neutral-400">
              sboxskins.gg
            </span>
          </div>
          <p className="text-xs text-neutral-600 text-center">
            Not affiliated with Facepunch Studios or Valve Corporation. S&box is a trademark of Facepunch Studios.
            Market data may be delayed.
          </p>
        </div>
      </div>
    </footer>
  );
}

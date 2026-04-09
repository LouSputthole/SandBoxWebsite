import Link from "next/link";
import { Gamepad2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-neutral-800 bg-[#0a0a0f] mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Browse</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/items" className="text-neutral-500 hover:text-white transition-colors">All Skins</Link></li>
              <li><Link href="/leaderboard" className="text-neutral-500 hover:text-white transition-colors">Leaderboard</Link></li>
              <li><Link href="/inventory" className="text-neutral-500 hover:text-white transition-colors">Inventory Checker</Link></li>
              <li><Link href="/items?sort=change-desc" className="text-neutral-500 hover:text-white transition-colors">Trending</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">By Type</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/items/type/character" className="text-neutral-500 hover:text-white transition-colors">Characters</Link></li>
              <li><Link href="/items/type/clothing" className="text-neutral-500 hover:text-white transition-colors">Clothing</Link></li>
              <li><Link href="/items/type/weapon" className="text-neutral-500 hover:text-white transition-colors">Weapons</Link></li>
              <li><Link href="/items/type/accessory" className="text-neutral-500 hover:text-white transition-colors">Accessories</Link></li>
              <li><Link href="/items/type/tool" className="text-neutral-500 hover:text-white transition-colors">Tools</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Info</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/faq" className="text-neutral-500 hover:text-white transition-colors">FAQ</Link></li>
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

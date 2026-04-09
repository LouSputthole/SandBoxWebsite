"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Menu, X, Gamepad2, Backpack } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/items?q=${encodeURIComponent(search.trim())}`);
      setSearch("");
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-[#0a0a0f]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Gamepad2 className="h-7 w-7 text-purple-500" />
            <span className="text-lg font-bold text-white hidden sm:block">
              sbox<span className="text-purple-400">skins</span><span className="text-neutral-500">.gg</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-5">
            <Link
              href="/items"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Browse
            </Link>
            <Link
              href="/inventory"
              className="text-sm text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Backpack className="h-3.5 w-3.5" />
              Inventory
            </Link>
            <Link
              href="/faq"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              FAQ
            </Link>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <Input
                placeholder="Search skins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-neutral-900/50 border-neutral-700/50"
              />
            </div>
          </form>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-neutral-800 py-4 space-y-2">
            <Link
              href="/items"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Browse
            </Link>
            <Link
              href="/inventory"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Inventory Checker
            </Link>
            <Link
              href="/faq"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </Link>
            <div className="px-3 pt-2 border-t border-neutral-800 mt-2">
              <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">Browse by Type</p>
              {["character", "clothing", "accessory", "weapon", "tool"].map((t) => (
                <Link
                  key={t}
                  href={`/items/type/${t}`}
                  className="block px-2 py-1.5 text-sm text-neutral-500 hover:text-white transition-colors capitalize"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

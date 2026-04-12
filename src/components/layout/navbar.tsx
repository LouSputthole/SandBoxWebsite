"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Search,
  Menu,
  X,
  Gamepad2,
  Backpack,
  BarChart3,
  Heart,
  LogIn,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";

export function Navbar() {
  const router = useRouter();
  const { user, loading: authLoading, login, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/items?q=${encodeURIComponent(search.trim())}`);
      setSearch("");
    }
  };

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-[#0a0a0f]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Gamepad2 className="h-7 w-7 text-purple-500" />
            <span className="text-lg font-bold text-white hidden sm:block">
              sbox<span className="text-purple-400">skins</span>
              <span className="text-neutral-500">.gg</span>
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
              href="/trends"
              className="text-sm text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Trends
            </Link>
            <Link
              href="/leaderboard"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Leaderboard
            </Link>
            <Link
              href="/inventory"
              className="text-sm text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Backpack className="h-3.5 w-3.5" />
              Inventory
            </Link>
            <Link
              href="/portfolio"
              className="text-sm text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Heart className="h-3.5 w-3.5" />
              Watchlist
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

          {/* Auth / User */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {authLoading ? (
              <div className="h-8 w-8 rounded-full bg-neutral-800 animate-pulse" />
            ) : user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 rounded-full border border-neutral-700/50 bg-neutral-900/50 px-2 py-1 hover:border-neutral-600 transition-colors"
                >
                  {user.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={user.username ?? "User"}
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-purple-400" />
                    </div>
                  )}
                  <span className="text-sm text-neutral-300 max-w-[100px] truncate">
                    {user.username ?? "User"}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg py-1 z-50">
                    <div className="px-3 py-2 border-b border-neutral-800">
                      <p className="text-xs text-neutral-500">Signed in as</p>
                      <p className="text-sm text-white truncate">
                        {user.username ?? user.steamId}
                      </p>
                    </div>
                    <Link
                      href="/portfolio"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Heart className="h-3.5 w-3.5" />
                      My Watchlist
                    </Link>
                    {user.profileUrl && (
                      <a
                        href={user.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <UserIcon className="h-3.5 w-3.5" />
                        Steam Profile
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-neutral-300 border-neutral-700"
                onClick={login}
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in with Steam
              </Button>
            )}
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
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
              href="/trends"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Market Trends
            </Link>
            <Link
              href="/leaderboard"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Leaderboard
            </Link>
            <Link
              href="/inventory"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Inventory Checker
            </Link>
            <Link
              href="/portfolio"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Watchlist
            </Link>
            <Link
              href="/faq"
              className="block px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </Link>

            {/* Mobile Auth */}
            <div className="px-3 pt-2 border-t border-neutral-800 mt-2">
              {authLoading ? null : user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 py-1">
                    {user.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt={user.username ?? "User"}
                        width={24}
                        height={24}
                        className="rounded-full"
                      />
                    ) : (
                      <UserIcon className="h-5 w-5 text-purple-400" />
                    )}
                    <span className="text-sm text-white">
                      {user.username ?? "User"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="block px-2 py-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    login();
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in with Steam
                </button>
              )}
            </div>

            <div className="px-3 pt-2 border-t border-neutral-800 mt-2">
              <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">
                Browse by Type
              </p>
              {["character", "clothing", "accessory", "weapon", "tool"].map(
                (t) => (
                  <Link
                    key={t}
                    href={`/items/type/${t}`}
                    className="block px-2 py-1.5 text-sm text-neutral-500 hover:text-white transition-colors capitalize"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t}
                  </Link>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

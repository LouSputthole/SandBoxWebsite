"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Search,
  Menu,
  X,
  Heart,
  LogIn,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { CurrencyPicker } from "@/components/layout/currency-picker";
import { NotificationBell } from "@/components/notifications/notification-bell";

// Primary desktop destinations (Arcade nav). The full set stays reachable
// via the mobile menu and footer.
const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Browse", href: "/items" },
  { label: "Trends", href: "/trends" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Trade", href: "/trade" },
  { label: "Store", href: "/store" },
  { label: "Whales", href: "/whales" },
];

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading, login, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

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
    <nav className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(14,13,19,0.82)] backdrop-blur-[12px]">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="flex h-16 items-center gap-4 lg:gap-[22px]">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-[11px] shrink-0">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-[11px] font-display text-base font-extrabold text-white"
              style={{
                background: "linear-gradient(140deg, var(--accent), var(--accent2))",
                boxShadow: "0 6px 18px -6px var(--accent)",
              }}
            >
              S&amp;
            </span>
            <span className="hidden font-display text-[19px] font-extrabold tracking-[-0.4px] text-[var(--tx)] sm:block">
              sboxskins<span className="font-semibold text-[var(--faint)]">.gg</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden items-center gap-5 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`font-sans text-sm font-medium transition-colors hover:text-[var(--tx)] ${
                  isActive(item.href) ? "text-[var(--accent)]" : "text-[var(--mut)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="ml-auto max-w-[280px] flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--faint)]" />
              <Input
                placeholder="Search skins…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 rounded-xl border-[var(--line)] bg-[var(--panel)] pl-9 text-[var(--tx)] placeholder:text-[var(--faint)] focus-visible:border-[var(--accent)] focus-visible:ring-0"
              />
            </div>
          </form>

          {/* Auth / User */}
          <div className="hidden items-center gap-[10px] shrink-0 md:flex">
            <CurrencyPicker variant="desktop" />
            {!authLoading && user && <NotificationBell />}
            {authLoading ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--panel)]" />
            ) : user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-2 py-1 transition-colors hover:border-[var(--accent)]"
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
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
                      <UserIcon className="h-4 w-4 text-[var(--accent)]" />
                    </div>
                  )}
                  <span className="max-w-[100px] truncate text-sm text-[var(--mut)]">
                    {user.username ?? "User"}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-1 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
                    <div className="border-b border-[var(--line)] px-3 py-2">
                      <p className="text-xs text-[var(--faint)]">Signed in as</p>
                      <p className="truncate text-sm text-[var(--tx)]">
                        {user.username ?? user.steamId}
                      </p>
                    </div>
                    <Link
                      href="/portfolio"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--mut)] transition-colors hover:bg-[var(--bg2)] hover:text-[var(--tx)]"
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
                        className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--mut)] transition-colors hover:bg-[var(--bg2)] hover:text-[var(--tx)]"
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
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--down)] transition-colors hover:bg-[var(--bg2)]"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                className="h-9 gap-2 rounded-xl bg-[var(--accent)] px-[15px] font-semibold text-white shadow-[0_8px_20px_-8px_var(--accent)] hover:brightness-[1.07]"
                onClick={login}
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Button>
            )}
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="text-[var(--mut)] md:hidden"
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
          <div className="space-y-2 border-t border-[var(--line)] py-4 md:hidden">
            {[
              { label: "Browse", href: "/items" },
              { label: "New Drops", href: "/new" },
              { label: "Market Trends", href: "/trends" },
              { label: "Leaderboard", href: "/leaderboard" },
              { label: "Trading Board", href: "/trade" },
              { label: "Store", href: "/store" },
              { label: "Whales", href: "/whales" },
              { label: "Market Reports", href: "/blog" },
              { label: "Compare", href: "/compare" },
              { label: "Inventory Checker", href: "/inventory" },
              { label: "Watchlist", href: "/portfolio" },
              { label: "FAQ", href: "/faq" },
              { label: "Contact", href: "/contact" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 text-sm transition-colors hover:text-[var(--tx)] ${
                  isActive(item.href) ? "text-[var(--accent)]" : "text-[var(--mut)]"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            {/* Currency picker (mobile) */}
            <div className="mt-2 border-t border-[var(--line)] pt-2">
              <CurrencyPicker variant="mobile" />
            </div>

            {/* Mobile Auth */}
            <div className="mt-2 border-t border-[var(--line)] px-3 pt-2">
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
                      <UserIcon className="h-5 w-5 text-[var(--accent)]" />
                    )}
                    <span className="text-sm text-[var(--tx)]">
                      {user.username ?? "User"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="block px-2 py-1.5 text-sm text-[var(--down)] transition-colors hover:brightness-110"
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
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--accent)] transition-colors hover:brightness-110"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in with Steam
                </button>
              )}
            </div>

            <div className="mt-2 border-t border-[var(--line)] px-3 pt-2">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--faint)]">
                Browse by Type
              </p>
              {["character", "clothing", "accessory", "weapon", "tool"].map(
                (t) => (
                  <Link
                    key={t}
                    href={`/items/type/${t}`}
                    className="block px-2 py-1.5 text-sm capitalize text-[var(--faint)] transition-colors hover:text-[var(--tx)]"
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

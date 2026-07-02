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
  LayoutGrid,
  ShoppingBag,
  Sparkles,
  BarChart3,
  Trophy,
  ArrowRightLeft,
  Store,
  Crown,
  Newspaper,
  Backpack,
  HelpCircle,
  Mail,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { CurrencyPicker } from "@/components/layout/currency-picker";
import { NotificationBell } from "@/components/notifications/notification-bell";

type NavItem = { label: string; href: string; icon: LucideIcon };

// The FULL navigation lives on desktop again, in the old navbar's order:
// Browse · New · Trends · Leaderboard · Trade · Store · Whales · Blog ·
// Inventory · Watchlist · FAQ · Contact. Because 12 icon-links can't share
// the 64px Arcade bar with the logo, search, currency chip and Steam button,
// it's split into an always-inline primary set, a couple that fold in at xl,
// and a "More" dropdown that surfaces the rest — all reachable on desktop.
const NAV_PRIMARY: NavItem[] = [
  { label: "Browse", href: "/items", icon: LayoutGrid },
  { label: "New", href: "/new", icon: Sparkles },
  { label: "Trends", href: "/trends", icon: BarChart3 },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "Trade", href: "/trade", icon: ArrowRightLeft },
  { label: "Market", href: "/market", icon: ShoppingBag },
];

// Inline at xl+, otherwise shown inside the "More" dropdown (no duplication —
// these are hidden in the dropdown at xl via `xl:hidden`).
const NAV_WIDE: NavItem[] = [
  { label: "Store", href: "/store", icon: Store },
  { label: "Whales", href: "/whales", icon: Crown },
];

// Always inside the "More" dropdown.
const NAV_MORE: NavItem[] = [
  { label: "Blog", href: "/blog", icon: Newspaper },
  { label: "Inventory", href: "/inventory", icon: Backpack },
  { label: "Watchlist", href: "/portfolio", icon: Heart },
  { label: "FAQ", href: "/faq", icon: HelpCircle },
  { label: "Contact", href: "/contact", icon: Mail },
];

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading, login, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  const moreActive = [...NAV_WIDE, ...NAV_MORE].some((i) => isActive(i.href));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/items?q=${encodeURIComponent(search.trim())}`);
      setSearch("");
    }
  };

  // Close the user / More dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node)
      ) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(14,13,19,0.82)] backdrop-blur-[12px]">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="flex h-16 items-center gap-3 lg:gap-4">
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

          {/* Desktop Nav — full link set with icons, in Arcade style */}
          <div className="hidden items-center gap-x-[18px] lg:flex">
            {NAV_PRIMARY.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 font-sans text-[13px] font-medium transition-colors hover:text-[var(--tx)] ${
                    isActive(item.href)
                      ? "text-[var(--accent)]"
                      : "text-[var(--mut)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}

            {/* Fold in at xl when there's room */}
            {NAV_WIDE.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`hidden items-center gap-1.5 font-sans text-[13px] font-medium transition-colors hover:text-[var(--tx)] xl:flex ${
                    isActive(item.href)
                      ? "text-[var(--accent)]"
                      : "text-[var(--mut)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}

            {/* More dropdown — keeps the rest of the nav reachable on desktop */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen((o) => !o)}
                aria-expanded={moreMenuOpen}
                className={`flex items-center gap-1 font-sans text-[13px] font-medium transition-colors hover:text-[var(--tx)] ${
                  moreActive || moreMenuOpen
                    ? "text-[var(--accent)]"
                    : "text-[var(--mut)]"
                }`}
              >
                More
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    moreMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {moreMenuOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-48 rounded-xl border border-[var(--line)] bg-[var(--panel)] py-1 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
                  {/* Shown here only below xl (these sit inline at xl) */}
                  {NAV_WIDE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreMenuOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--bg2)] hover:text-[var(--tx)] xl:hidden ${
                          isActive(item.href)
                            ? "text-[var(--accent)]"
                            : "text-[var(--mut)]"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.label}
                      </Link>
                    );
                  })}
                  {NAV_MORE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreMenuOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--bg2)] hover:text-[var(--tx)] ${
                          isActive(item.href)
                            ? "text-[var(--accent)]"
                            : "text-[var(--mut)]"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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
          <div className="hidden items-center gap-[10px] shrink-0 lg:flex">
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
                Sign in with Steam
              </Button>
            )}
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="text-[var(--mut)] lg:hidden"
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
          <div className="space-y-2 border-t border-[var(--line)] py-4 lg:hidden">
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

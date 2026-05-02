"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight } from "lucide-react";

/**
 * Site-wide announcement banner. Renders above the homepage hero and
 * dismisses to a localStorage flag so returning users don't see it
 * again. Re-shows when the `id` prop changes — bump the id when a
 * new announcement ships and previously-dismissing users see it
 * fresh.
 *
 * Kept dead-simple on purpose: hardcoded copy + link in the parent.
 * If we end up shipping more than ~one of these a month I'll spin
 * up a real Announcements model with a /admin/announcements page.
 * Until then, this is a one-line edit per drop.
 */
interface AnnouncementBannerProps {
  /** Stable identifier for this announcement. localStorage flag is
   *  keyed on this so changing the id resurrects the banner for users
   *  who'd dismissed previous ones. */
  id: string;
  text: string;
  ctaText?: string;
  href: string;
}

export function AnnouncementBanner({
  id,
  text,
  ctaText = "Read more",
  href,
}: AnnouncementBannerProps) {
  // Render nothing on initial server render to avoid an SSR-vs-client
  // hydration mismatch (localStorage isn't available server-side).
  // Fade in client-side once we've checked the dismissed flag.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const storageKey = `announcement-dismissed:${id}`;

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      // Private mode / quota / etc — show the banner anyway.
    }
    setMounted(true);
  }, [storageKey]);

  if (!mounted || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Best effort.
    }
  }

  return (
    <div className="border-b border-purple-500/20 bg-gradient-to-r from-purple-500/15 via-purple-500/10 to-purple-500/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-purple-300 shrink-0" />
        <p className="text-sm text-purple-100 flex-1 min-w-0">
          <span className="font-semibold">{text}</span>{" "}
          <Link
            href={href}
            className="text-purple-300 hover:text-white underline-offset-2 hover:underline inline-flex items-center gap-0.5"
          >
            {ctaText}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="text-purple-300 hover:text-white shrink-0 p-1 -m-1 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

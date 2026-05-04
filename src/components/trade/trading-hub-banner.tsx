"use client";

import { useState, useEffect } from "react";
import { Users, X, ArrowRight } from "lucide-react";
import { PARTNER, partnerUrl } from "@/lib/partner/config";

/**
 * Banner above the /trade listings grid pointing traders at the
 * Trading Hub for in-person coordination. Dismissible per-browser
 * via localStorage so returning visitors aren't nagged. Renders
 * nothing when the partner kill-switch is off (PARTNER.enabled).
 *
 * Cousin of <AnnouncementBanner /> on the homepage but tonally
 * different — this is a contextual call-to-action on a relevant
 * page, not a top-of-site announcement.
 */
const STORAGE_KEY = "trading-hub-banner-dismissed:v1";

export function TradingHubBanner() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Best effort.
    }
    setMounted(true);
  }, []);

  if (!PARTNER.enabled || !mounted || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Best effort.
    }
  }

  return (
    <div className="rounded-lg border border-purple-500/25 bg-purple-500/5 px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <Users className="h-4 w-4 text-purple-300 shrink-0" />
      <p className="text-sm text-purple-100 flex-1 min-w-0 leading-relaxed">
        Want to meet face-to-face?{" "}
        <a
          href={partnerUrl("trade_banner")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-white hover:text-purple-200 underline-offset-2 hover:underline inline-flex items-center gap-0.5"
        >
          Coordinate trades at the {PARTNER.name}
          <ArrowRight className="h-3 w-3" />
        </a>{" "}
        — in-game meetup spot + Discord, no fees.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss banner"
        className="text-purple-300 hover:text-white shrink-0 p-1 -m-1 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

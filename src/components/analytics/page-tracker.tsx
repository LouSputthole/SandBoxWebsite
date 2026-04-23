"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Tracks page views by sending a lightweight POST to /api/analytics on
 * each route change. Uses sendBeacon for reliability.
 *
 * Referrer handling (important): `document.referrer` is set by the
 * browser on the initial hard navigation and does NOT update during
 * client-side (Next.js Link) navigation. Without special handling, a
 * single Google click inflates into N "google.com" pageviews as the
 * user browses the site — every internal nav inherits the entry
 * referrer. We fix that by including document.referrer ONLY on the
 * first pageview of the session (the actual landing). Subsequent SPA
 * navigations send referrer: null, which the API treats as internal.
 */
export function PageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef<string>("");

  useEffect(() => {
    const fullPath = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    // Don't double-track the same path
    if (fullPath === lastPath.current) return;

    // First pageview of this mount? (lastPath is still the initial "")
    const isLanding = lastPath.current === "";
    lastPath.current = fullPath;

    // Skip API routes and static assets
    if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return;

    const data = JSON.stringify({
      path: fullPath,
      // Only the landing pageview carries the external referrer.
      // Internal SPA nav would otherwise drag the entry referrer along
      // for every subsequent view and massively inflate source counts.
      referrer: isLanding ? document.referrer || null : null,
    });

    // Use sendBeacon for reliability (survives page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/analytics",
        new Blob([data], { type: "application/json" }),
      );
    } else {
      fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
        keepalive: true,
      }).catch(() => {});
    }
  }, [pathname, searchParams]);

  return null;
}

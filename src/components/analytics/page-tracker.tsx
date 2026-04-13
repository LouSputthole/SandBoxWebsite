"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Tracks page views by sending a lightweight POST to /api/analytics
 * on each route change. Uses sendBeacon for reliability.
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
    lastPath.current = fullPath;

    // Skip API routes and static assets
    if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return;

    const data = JSON.stringify({
      path: fullPath,
      referrer: document.referrer || null,
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

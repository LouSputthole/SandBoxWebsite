import type { Metadata } from "next";
import { getMarketAccess } from "@/lib/market/access-server";
import { ComingSoon } from "./_components/coming-soon";

// The whole /market section stays out of Google (grey-zone crypto marketplace;
// protects the tracker's index). This applies to the coming-soon takeover too,
// and every nested page inherits it unless it sets its own robots.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Section gate for the marketplace. When gated (MARKET_OPEN !== "true" and the
 * visitor is neither an allowlisted SteamID nor holding a valid preview cookie),
 * render ONLY the coming-soon takeover — never the children. When open, render
 * the marketplace normally. Covers /market and everything under it: /market/sell,
 * /market/ledger, /market/u/[steamId], /market/[id], /market/orders/**.
 */
export default async function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getMarketAccess();
  if (!access.open) return <ComingSoon />;
  return <>{children}</>;
}

import { NextRequest, NextResponse } from "next/server";
import { partnerUrl, PARTNER } from "@/lib/partner/config";

/**
 * GET /go/hub — stable outbound redirect to the Trading Hub.
 *
 * Centralizes the partner URL behind one path so:
 *   - blog posts + tweets + emails link to /go/hub regardless of
 *     where the actual Hub lives now (Discord, web, Steam invite,
 *     whatever they switch to)
 *   - we can swap the destination by editing one config file
 *   - every click goes through the same UTM-tagged hop, giving
 *     us a clean analytics signal
 *
 * Returns 503 when PARTNER.enabled is false, so a kill-switch
 * pause hides the link entirely instead of redirecting nowhere.
 */
export function GET(request: NextRequest) {
  if (!PARTNER.enabled) {
    return NextResponse.json(
      { error: "Partner link is currently disabled" },
      { status: 503 },
    );
  }
  // Allow the caller to specify which surface they came from so
  // attribution stays accurate (e.g. /go/hub?from=blog vs ?from=tweet).
  const from = request.nextUrl.searchParams.get("from") || "go_link";
  return NextResponse.redirect(partnerUrl(from), { status: 302 });
}

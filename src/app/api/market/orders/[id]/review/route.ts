import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { MarketBannedError } from "@/lib/market/bans";
import { createReview, ReviewError } from "@/lib/market/review-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/market/orders/[id]/review — the BUYER rates the seller after a RELEASED order.
 * Body: { stars: 1..5, comment?: string }. Authed; only the order's buyer; only when the order is
 * RELEASED; one review per order (repeat → 409). Returns the created review.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  let body: { stars?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.stars !== "number") {
    return NextResponse.json({ error: "`stars` must be a number from 1 to 5" }, { status: 400 });
  }
  const comment = typeof body.comment === "string" ? body.comment : null;

  try {
    const review = await createReview({ orderId: id, buyerId: user.id, stars: body.stars, comment });
    return NextResponse.json({
      id: review.id,
      stars: review.stars,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
    });
  } catch (err) {
    // Banned rater (Steam id or wallet) — never allowed to leave reputation. TOS enforcement.
    if (err instanceof MarketBannedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ReviewError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Could not save review";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

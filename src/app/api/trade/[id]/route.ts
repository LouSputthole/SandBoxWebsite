import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/trade/[id] — Public single-listing fetch. Bumps viewCount.
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const listing = await prisma.tradeListing.findUnique({
    where: { id },
    include: {
      user: {
        // Include steamTradeUrl ONLY because the detail page needs to render
        // the "Open trade on Steam" button. Don't echo it through other
        // endpoints. (Trade URLs aren't secrets per se — they're given to
        // any non-friend you want to trade with — but no need to splash
        // them around either.)
        select: {
          steamId: true,
          username: true,
          avatarUrl: true,
          steamTradeUrl: true,
        },
      },
      items: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageUrl: true,
              type: true,
              currentPrice: true,
              lowestPrice: true,
            },
          },
        },
      },
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fire-and-forget viewCount bump — don't block the response on it.
  prisma.tradeListing
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  return NextResponse.json({ listing });
}

/**
 * PATCH /api/trade/[id] — owner-only state changes. Body: { status }
 *   - "completed" — owner marks the trade done
 *   - "cancelled" — owner pulls the listing
 *
 * No re-activation: once completed/cancelled/expired, stays that way.
 * Avoids "wait, didn't this just complete?" confusion.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.status !== "completed" && body.status !== "cancelled") {
    return NextResponse.json(
      { error: "status must be 'completed' or 'cancelled'" },
      { status: 400 },
    );
  }

  const listing = await prisma.tradeListing.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (listing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (listing.status !== "active") {
    return NextResponse.json(
      { error: `Listing is already ${listing.status}` },
      { status: 409 },
    );
  }

  const updated = await prisma.tradeListing.update({
    where: { id },
    data: { status: body.status },
  });
  return NextResponse.json({ listing: updated });
}

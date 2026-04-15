import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/alerts — Create a new price alert.
 * Body: { email, itemId, targetPrice, direction }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, itemId, targetPrice, direction } = body;

    if (!email || !itemId || targetPrice == null || !direction) {
      return NextResponse.json(
        { error: "Missing required fields: email, itemId, targetPrice, direction" },
        { status: 400 }
      );
    }

    if (!["below", "above"].includes(direction)) {
      return NextResponse.json(
        { error: "direction must be 'below' or 'above'" },
        { status: 400 }
      );
    }

    if (typeof targetPrice !== "number" || targetPrice <= 0) {
      return NextResponse.json(
        { error: "targetPrice must be a positive number" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Check item exists
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Limit alerts per email (prevent abuse)
    const existingCount = await prisma.priceAlert.count({
      where: { email, active: true },
    });
    if (existingCount >= 20) {
      return NextResponse.json(
        { error: "Maximum 20 active alerts per email" },
        { status: 429 }
      );
    }

    const alert = await prisma.priceAlert.create({
      data: { email, itemId, targetPrice, direction },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    console.error("[alerts] Create error:", error);
    return NextResponse.json(
      { error: "Failed to create alert" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/alerts?email=... — List alerts for an email.
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "email query parameter required" },
      { status: 400 }
    );
  }

  try {
    const alerts = await prisma.priceAlert.findMany({
      where: { email },
      include: {
        item: {
          select: { id: true, name: true, slug: true, currentPrice: true, imageUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error("[alerts] List error:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/alerts?id=...&email=... — Delete a specific alert.
 *
 * Requires both the alert ID and the email that created it. Prevents drive-by
 * deletion of other users' alerts by anyone who can guess/scrape alert UUIDs.
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const email = request.nextUrl.searchParams.get("email");

  if (!id) {
    return NextResponse.json({ error: "id query parameter required" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: "email query parameter required" }, { status: 400 });
  }

  try {
    // deleteMany returns a count; if 0, the alert either doesn't exist OR the
    // email doesn't match — either way we 404 without leaking which it was.
    const result = await prisma.priceAlert.deleteMany({
      where: { id, email },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[alerts] Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete alert" },
      { status: 500 }
    );
  }
}

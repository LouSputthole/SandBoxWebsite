import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/alerts — Create a new price alert.
 * Body: { email, itemId, targetPrice, direction }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, discordWebhook, itemId, targetPrice, direction } = body;

    if (!itemId || targetPrice == null || !direction) {
      return NextResponse.json(
        { error: "Missing required fields: itemId, targetPrice, direction" },
        { status: 400 }
      );
    }
    if (!email && !discordWebhook) {
      return NextResponse.json(
        { error: "Provide at least one destination: email or discordWebhook" },
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

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
    }

    if (discordWebhook) {
      // Accept either discord.com or discordapp.com webhook URLs
      const webhookRegex = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;
      if (!webhookRegex.test(discordWebhook)) {
        return NextResponse.json(
          { error: "Invalid Discord webhook URL. Expected https://discord.com/api/webhooks/.../..." },
          { status: 400 }
        );
      }
    }

    // Check item exists
    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Rate limit per destination — prevents someone registering thousands of
    // alerts pointing at one webhook and spamming it when prices move.
    if (email) {
      const count = await prisma.priceAlert.count({
        where: { email, active: true },
      });
      if (count >= 20) {
        return NextResponse.json(
          { error: "Maximum 20 active alerts per email" },
          { status: 429 }
        );
      }
    }
    if (discordWebhook) {
      const count = await prisma.priceAlert.count({
        where: { discordWebhook, active: true },
      });
      if (count >= 10) {
        return NextResponse.json(
          { error: "Maximum 10 active alerts per Discord webhook" },
          { status: 429 }
        );
      }
    }

    const alert = await prisma.priceAlert.create({
      data: { email: email ?? null, discordWebhook: discordWebhook ?? null, itemId, targetPrice, direction },
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
 *
 * Only requires knowing the email address (no auth). To prevent leaking
 * sensitive bearer secrets, we NEVER return the raw discordWebhook URL —
 * it's a bearer token that lets the holder POST messages into a channel.
 * We expose a boolean + redacted preview so users can still identify which
 * webhook an alert is pointing at without leaking the secret portion.
 */
function redactWebhook(url: string | null): string | null {
  if (!url) return null;
  // Discord webhook URL: .../webhooks/<id>/<secret_token>
  // Keep the id so the user can tell two alerts apart; redact the token.
  const match = url.match(/\/webhooks\/(\d+)\/[\w-]+$/);
  if (!match) return "configured";
  return `…/webhooks/${match[1]}/***`;
}

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
      // Explicit select — NEVER return raw discordWebhook.
      select: {
        id: true,
        email: true,
        discordWebhook: true,
        itemId: true,
        targetPrice: true,
        direction: true,
        active: true,
        triggered: true,
        triggeredAt: true,
        createdAt: true,
        item: {
          select: { id: true, name: true, slug: true, currentPrice: true, imageUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const redacted = alerts.map((a) => ({
      ...a,
      discordWebhook: redactWebhook(a.discordWebhook),
      hasDiscordWebhook: a.discordWebhook !== null,
    }));

    return NextResponse.json(redacted);
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

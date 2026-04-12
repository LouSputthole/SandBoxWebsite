import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * GET /api/watchlist — Get the current user's watchlist slugs.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const items = await prisma.watchlistItem.findMany({
    where: { userId: user.id },
    select: { itemSlug: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    slugs: items.map((i) => i.itemSlug),
  });
}

/**
 * POST /api/watchlist — Add an item to the watchlist.
 * Body: { slug: string }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slug } = (await request.json()) as { slug?: string };
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  // Upsert to avoid duplicates
  await prisma.watchlistItem.upsert({
    where: { userId_itemSlug: { userId: user.id, itemSlug: slug } },
    update: {},
    create: { userId: user.id, itemSlug: slug },
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/watchlist — Remove an item from the watchlist.
 * Body: { slug: string }
 */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slug } = (await request.json()) as { slug?: string };
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  await prisma.watchlistItem.deleteMany({
    where: { userId: user.id, itemSlug: slug },
  });

  return NextResponse.json({ success: true });
}

/**
 * PUT /api/watchlist — Merge multiple slugs into the watchlist (used after login).
 * Body: { slugs: string[] }
 */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slugs } = (await request.json()) as { slugs?: string[] };
  if (!Array.isArray(slugs)) {
    return NextResponse.json({ error: "Missing slugs array" }, { status: 400 });
  }

  // Get existing slugs to avoid unnecessary upserts
  const existing = await prisma.watchlistItem.findMany({
    where: { userId: user.id },
    select: { itemSlug: true },
  });
  const existingSet = new Set(existing.map((e) => e.itemSlug));

  // Add new ones
  const newSlugs = slugs.filter((s) => !existingSet.has(s));
  if (newSlugs.length > 0) {
    await prisma.watchlistItem.createMany({
      data: newSlugs.map((slug) => ({
        userId: user.id,
        itemSlug: slug,
      })),
      skipDuplicates: true,
    });
  }

  // Return the full merged watchlist
  const all = await prisma.watchlistItem.findMany({
    where: { userId: user.id },
    select: { itemSlug: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    slugs: all.map((i) => i.itemSlug),
    merged: newSlugs.length,
  });
}

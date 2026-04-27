import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * GET /api/notifications
 *   Recent notifications + unread count for the bell badge. Lightweight
 *   so the navbar can poll every 60s without thrashing the DB.
 *
 * POST /api/notifications/read
 *   Body { id?: string } — mark one notification read by id, or omit
 *   to mark every unread notification read (used by the "mark all"
 *   button in the dropdown).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { unreadCount: 0, notifications: [] },
      { status: 200 },
    );
  }

  const [unreadCount, notifications] = await Promise.all([
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    unreadCount,
    notifications: notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt ? n.readAt.toISOString() : null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.id) {
    // Mark a single notification read. Scoped to the current user so
    // someone can't flip another user's flag by guessing IDs.
    const result = await prisma.notification.updateMany({
      where: { id: body.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, updated: result.count });
  }

  // Mark all unread for this user.
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, updated: result.count });
}

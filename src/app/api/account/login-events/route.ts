import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * GET /api/account/login-events
 *   Recent (last 30) audit events for the current user. Used by
 *   /account/sessions to surface logins, logouts, revocations, and
 *   anomaly flags so the user can spot anything they don't recognize.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const events = await prisma.loginEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      kind: true,
      reason: true,
      ipHash: true,
      userAgent: true,
      createdAt: true,
      sessionId: true,
    },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

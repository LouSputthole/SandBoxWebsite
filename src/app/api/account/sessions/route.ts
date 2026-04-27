import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { recordLoginEvent } from "@/lib/auth/audit";

/**
 * GET /api/account/sessions
 *   List the current user's active (non-expired) sessions, with the
 *   active-device flag set on the row that matches this request's
 *   token. Hashes/UAs are returned so the UI can derive friendly
 *   device labels client-side.
 *
 * DELETE /api/account/sessions
 *   "Log out of every other device." Keeps the current session, drops
 *   all others, writes a single session_revoked_all audit event.
 */

export async function GET() {
  const current = await getCurrentSession();
  if (!current) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rows = await prisma.session.findMany({
    where: {
      userId: current.userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      ipHash: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json({
    currentSessionId: current.id,
    sessions: rows.map((s) => ({
      id: s.id,
      isCurrent: s.id === current.id,
      ipHash: s.ipHash,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    })),
  });
}

export async function DELETE() {
  const current = await getCurrentSession();
  if (!current) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await prisma.session.deleteMany({
    where: {
      userId: current.userId,
      id: { not: current.id },
    },
  });

  await recordLoginEvent({
    userId: current.userId,
    sessionId: current.id,
    kind: "session_revoked_all",
    reason: `revoked ${result.count} other session(s)`,
  });

  return NextResponse.json({ ok: true, revoked: result.count });
}

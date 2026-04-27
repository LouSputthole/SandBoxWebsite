import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { recordLoginEvent } from "@/lib/auth/audit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/account/sessions/[id] — Revoke a single session by id.
 * The session must belong to the current user. Revoking the current
 * session is allowed but redirects the user to the login screen on
 * the next request (the cookie no longer matches anything).
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const current = await getCurrentSession();
  if (!current) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const target = await prisma.session.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!target || target.userId !== current.userId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await prisma.session.delete({ where: { id: target.id } });
  await recordLoginEvent({
    userId: current.userId,
    sessionId: target.id,
    kind: "session_revoked",
    reason: target.id === current.id ? "self" : "other device",
  });

  return NextResponse.json({ ok: true });
}

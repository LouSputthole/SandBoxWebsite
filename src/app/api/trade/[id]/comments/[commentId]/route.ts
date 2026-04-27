import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

/**
 * DELETE /api/trade/[id]/comments/[commentId] — soft-delete a comment.
 * Author can delete their own; admin (ANALYTICS_KEY bearer) can delete
 * any. Soft-delete preserves the row for audit + so a deleted comment
 * doesn't break thread anchoring on any future reply feature.
 */
export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id, commentId } = await ctx.params;

  const adminKey = process.env.ANALYTICS_KEY;
  const authHeader = request.headers.get("authorization");
  const isAdmin =
    !!adminKey && authHeader === `Bearer ${adminKey}`;

  let actor: string | null = null;
  if (isAdmin) {
    actor = "admin";
  } else {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    actor = user.id;
  }

  const comment = await prisma.tradeComment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, listingId: true, deletedAt: true },
  });
  if (!comment || comment.listingId !== id) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (comment.deletedAt) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }
  if (!isAdmin && comment.userId !== actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.tradeComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date(), deletedBy: actor },
  });

  return NextResponse.json({ ok: true });
}

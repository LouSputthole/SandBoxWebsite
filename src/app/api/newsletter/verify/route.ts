import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/newsletter/verify?token=<verifyToken>
 *
 * Confirms a subscription. Single-use: on success we clear the
 * verifyToken so the link can't be replayed. Returns a redirect to
 * /newsletter/confirm so the user lands on a friendly page instead of
 * raw JSON.
 *
 * Timing-safe comparison isn't needed here — `where: { verifyToken }`
 * is an indexed lookup, not a secret-equals-secret compare.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const confirmUrl = new URL("/newsletter/confirm", request.nextUrl.origin);

  if (!token) {
    confirmUrl.searchParams.set("status", "missing-token");
    return NextResponse.redirect(confirmUrl);
  }

  const sub = await prisma.newsletterSubscription.findUnique({
    where: { verifyToken: token },
  });
  if (!sub) {
    confirmUrl.searchParams.set("status", "invalid");
    return NextResponse.redirect(confirmUrl);
  }

  if (sub.verified) {
    confirmUrl.searchParams.set("status", "already-verified");
    return NextResponse.redirect(confirmUrl);
  }

  await prisma.newsletterSubscription.update({
    where: { id: sub.id },
    data: {
      verified: true,
      verifiedAt: new Date(),
      verifyToken: null,
      unsubscribedAt: null,
    },
  });

  confirmUrl.searchParams.set("status", "verified");
  return NextResponse.redirect(confirmUrl);
}

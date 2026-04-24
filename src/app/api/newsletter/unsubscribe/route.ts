import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/newsletter/unsubscribe?token=<unsubscribeToken>&kind=<optional>
 *
 * One-click unsubscribe, linked from the footer of every newsletter
 * email. Idempotent — clicking twice is fine; already-unsubscribed
 * rows just re-stamp the timestamp.
 *
 * Optional `kind` narrows the unsubscribe to a single newsletter, so a
 * subscriber can drop Monday but keep Friday. No `kind` = unsubscribe
 * from everything.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const kind = request.nextUrl.searchParams.get("kind");
  const goodbyeUrl = new URL("/newsletter/goodbye", request.nextUrl.origin);

  if (!token) {
    goodbyeUrl.searchParams.set("status", "missing-token");
    return NextResponse.redirect(goodbyeUrl);
  }

  const sub = await prisma.newsletterSubscription.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!sub) {
    goodbyeUrl.searchParams.set("status", "invalid");
    return NextResponse.redirect(goodbyeUrl);
  }

  if (kind) {
    // Partial unsubscribe — drop just this kind. If the remaining kinds
    // list goes empty, treat it as a full unsubscribe so we don't keep
    // a zombie row that receives no newsletters.
    const newKinds = sub.kinds.filter((k) => k !== kind);
    if (newKinds.length === 0) {
      await prisma.newsletterSubscription.update({
        where: { id: sub.id },
        data: { kinds: [], unsubscribedAt: new Date() },
      });
    } else {
      await prisma.newsletterSubscription.update({
        where: { id: sub.id },
        data: { kinds: newKinds },
      });
    }
    goodbyeUrl.searchParams.set("status", "partial");
    goodbyeUrl.searchParams.set("kind", kind);
    return NextResponse.redirect(goodbyeUrl);
  }

  await prisma.newsletterSubscription.update({
    where: { id: sub.id },
    data: {
      unsubscribedAt: new Date(),
      kinds: [],
    },
  });

  goodbyeUrl.searchParams.set("status", "unsubscribed");
  return NextResponse.redirect(goodbyeUrl);
}

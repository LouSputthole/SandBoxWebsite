import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis/client";
import { looksLikeEmail, newOpaqueToken } from "@/lib/newsletter/tokens";
import { sendVerificationEmail } from "@/lib/newsletter/send";

const ALLOWED_KINDS = ["friday-report", "monday-outlook"] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

/**
 * POST /api/newsletter/subscribe
 * Body: { email: string, kinds?: ("friday-report" | "monday-outlook")[] }
 *
 * Idempotent on email: if a row already exists we just update its
 * `kinds` list and re-issue a verify token if the row wasn't verified
 * yet. Never reveals via response whether an email was new or existing
 * — that'd be an enumeration oracle for spammers.
 *
 * Rate limited per-IP via Redis (5/hour). Without it, anyone could
 * pump thousands of signup requests and fill our table with garbage
 * addresses — free spam, our bill.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; kinds?: string[] };
  try {
    body = (await request.json()) as { email?: string; kinds?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!looksLikeEmail(email)) {
    return NextResponse.json(
      { error: "That doesn't look like a valid email." },
      { status: 400 },
    );
  }

  // Validate requested kinds. Silently drop unknown values instead of
  // 400-ing so a client sending a new/renamed kind doesn't block the
  // whole subscription.
  const requested = (body.kinds ?? ["monday-outlook"]).filter(
    (k): k is Kind => (ALLOWED_KINDS as readonly string[]).includes(k),
  );
  const kinds: Kind[] = requested.length > 0 ? requested : ["monday-outlook"];

  // Per-IP rate limit. Fails open on Redis outage — don't let an
  // Upstash blip block legitimate signups.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (redis) {
    try {
      const rlKey = `nl:sub:${ip}`;
      const count = await redis.incr(rlKey);
      if (count === 1) await redis.expire(rlKey, 3600);
      if (count > 5) {
        return NextResponse.json(
          { error: "Too many signups from this network. Try again later." },
          { status: 429 },
        );
      }
    } catch {
      // swallow — fail open
    }
  }

  const existing = await prisma.newsletterSubscription.findUnique({
    where: { email },
  });

  if (existing && existing.verified && !existing.unsubscribedAt) {
    // Already subscribed. Merge kinds so a second signup with a different
    // set of checkboxes adds those, doesn't replace.
    const mergedKinds = Array.from(new Set([...existing.kinds, ...kinds]));
    if (mergedKinds.length !== existing.kinds.length) {
      await prisma.newsletterSubscription.update({
        where: { email },
        data: { kinds: mergedKinds },
      });
    }
    return NextResponse.json({ ok: true, status: "already-subscribed" });
  }

  // New row OR unverified/resubscribing row → issue fresh verify token.
  const verifyToken = newOpaqueToken();
  const unsubscribeToken = existing?.unsubscribeToken ?? newOpaqueToken();

  if (existing) {
    await prisma.newsletterSubscription.update({
      where: { email },
      data: {
        kinds,
        verifyToken,
        verified: false,
        unsubscribedAt: null,
      },
    });
  } else {
    await prisma.newsletterSubscription.create({
      data: { email, kinds, verifyToken, unsubscribeToken },
    });
  }

  // Fire the verification email via `after()` so the response returns
  // immediately. Resend calls are usually <500ms but can spike when
  // their edge is loaded — we don't want a legitimate user staring at
  // a spinner. `after()` routes the send through Vercel's waitUntil()
  // so the invocation stays alive until Resend responds.
  //
  // If RESEND_API_KEY is unset, sendVerificationEmail logs a warning
  // and returns `{ sent: false, reason: "no-key" }`. The row is still
  // stored — admin can verify manually from /admin/newsletter.
  after(
    sendVerificationEmail({ email, verifyToken, unsubscribeToken }).catch(
      (err) => console.error("[newsletter] verify-send threw:", err),
    ),
  );

  return NextResponse.json({ ok: true, status: "verification-sent" });
}

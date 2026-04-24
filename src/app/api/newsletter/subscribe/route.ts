import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis/client";
import { looksLikeEmail, newOpaqueToken } from "@/lib/newsletter/tokens";
import { sendWelcomeEmail } from "@/lib/newsletter/send";

const ALLOWED_KINDS = ["friday-report", "monday-outlook"] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

/**
 * POST /api/newsletter/subscribe
 * Body: { email: string, kinds?: ("friday-report" | "monday-outlook")[] }
 *
 * Single opt-in: new rows are marked verified immediately and a welcome
 * email fires. Chose single opt-in because the conversion loss from the
 * double-confirm click is real (15-30% of signups never click verify)
 * and the risk surface is bounded:
 *   - Rate-limited 5/hour per IP via Redis (fail-open on outage)
 *   - Every outgoing email includes a one-click unsubscribe with
 *     List-Unsubscribe headers for Gmail's native button
 *   - Anyone typed in maliciously can unsub in one click from any
 *     newsletter we send
 *
 * Idempotent on email. Never reveals whether an email was new or existing
 * — that'd be an enumeration oracle.
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

  if (existing && !existing.unsubscribedAt) {
    // Already subscribed (verified or not). Merge kinds so a second
    // signup with a different set of checkboxes adds those, doesn't
    // replace. Flip `verified` to true in case this row predates
    // single-opt-in (legacy rows with pending verification inherit
    // the new policy retroactively — they clicked "subscribe", that's
    // consent).
    const mergedKinds = Array.from(new Set([...existing.kinds, ...kinds]));
    await prisma.newsletterSubscription.update({
      where: { email },
      data: {
        kinds: mergedKinds,
        verified: true,
        verifiedAt: existing.verifiedAt ?? new Date(),
        verifyToken: null,
      },
    });
    return NextResponse.json({ ok: true, status: "already-subscribed" });
  }

  // New row OR previously-unsubscribed resub. Mark verified immediately.
  const unsubscribeToken = existing?.unsubscribeToken ?? newOpaqueToken();

  if (existing) {
    await prisma.newsletterSubscription.update({
      where: { email },
      data: {
        kinds,
        verified: true,
        verifiedAt: new Date(),
        verifyToken: null,
        unsubscribedAt: null,
      },
    });
  } else {
    await prisma.newsletterSubscription.create({
      data: {
        email,
        kinds,
        verified: true,
        verifiedAt: new Date(),
        // Legacy column — kept NOT NULL... actually it's nullable. We
        // just don't use it anymore, set to null.
        verifyToken: null,
        unsubscribeToken,
      },
    });
  }

  // Fire a welcome email via `after()` so the response returns
  // immediately. No-op gracefully if RESEND_API_KEY is missing — the
  // subscription row is stored regardless.
  after(
    sendWelcomeEmail({ email, unsubscribeToken, kinds }).catch((err) =>
      console.error("[newsletter] welcome-send threw:", err),
    ),
  );

  return NextResponse.json({ ok: true, status: "subscribed" });
}

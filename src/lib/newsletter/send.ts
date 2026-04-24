import { prisma } from "@/lib/db";
import {
  getResend,
  hasResend,
  SENDER_FROM,
  SENDER_REPLY_TO,
  SITE_ORIGIN,
} from "./client";
import { buildIssueEmail, buildVerifyEmail, buildWelcomeEmail } from "./templates";

/**
 * Email send helpers. Every function gracefully no-ops if
 * `RESEND_API_KEY` is unset — callers get `{ sent: false, reason }`
 * instead of an exception, so the subscribe endpoint can still
 * succeed in local dev or staging without real email provider setup.
 */

export interface SendResult {
  sent: boolean;
  reason?: string;
  resendId?: string;
}

function verifyUrl(token: string): string {
  return `${SITE_ORIGIN}/api/newsletter/verify?token=${encodeURIComponent(token)}`;
}

function unsubscribeUrl(token: string, kind?: string): string {
  const base = `${SITE_ORIGIN}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  return kind ? `${base}&kind=${encodeURIComponent(kind)}` : base;
}

export async function sendVerificationEmail(opts: {
  email: string;
  verifyToken: string;
  unsubscribeToken: string;
}): Promise<SendResult> {
  const client = getResend();
  if (!client) {
    console.warn(
      `[newsletter] RESEND_API_KEY missing — would have sent verification to ${opts.email}`,
    );
    return { sent: false, reason: "no-key" };
  }

  const { subject, html, text } = buildVerifyEmail({
    verifyUrl: verifyUrl(opts.verifyToken),
    unsubscribeUrl: unsubscribeUrl(opts.unsubscribeToken),
  });

  try {
    const { data, error } = await client.emails.send({
      from: SENDER_FROM,
      to: [opts.email],
      replyTo: SENDER_REPLY_TO,
      subject,
      html,
      text,
      headers: {
        // RFC 8058: one-click unsubscribe via an HTTP POST, which Gmail
        // surfaces as a native "Unsubscribe" button. Without this we
        // lose that inbox affordance on bulk mail.
        "List-Unsubscribe": `<${unsubscribeUrl(opts.unsubscribeToken)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (error) {
      console.error(`[newsletter] verify send failed:`, error);
      return { sent: false, reason: error.message };
    }
    return { sent: true, resendId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[newsletter] verify send threw:`, message);
    return { sent: false, reason: message };
  }
}

/**
 * Welcome email sent on signup (single-opt-in flow). Greets the new
 * subscriber, confirms which newsletters they picked, and prominently
 * features the unsubscribe link so someone who was signed up without
 * intent can get out in one click.
 */
export async function sendWelcomeEmail(opts: {
  email: string;
  unsubscribeToken: string;
  kinds: string[];
}): Promise<SendResult> {
  const client = getResend();
  if (!client) {
    console.warn(
      `[newsletter] RESEND_API_KEY missing — would have sent welcome to ${opts.email}`,
    );
    return { sent: false, reason: "no-key" };
  }

  const { subject, html, text } = buildWelcomeEmail({
    kinds: opts.kinds,
    unsubscribeUrl: unsubscribeUrl(opts.unsubscribeToken),
  });

  try {
    const { data, error } = await client.emails.send({
      from: SENDER_FROM,
      to: [opts.email],
      replyTo: SENDER_REPLY_TO,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(opts.unsubscribeToken)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (error) {
      console.error(`[newsletter] welcome send failed:`, error);
      return { sent: false, reason: error.message };
    }
    return { sent: true, resendId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[newsletter] welcome send threw:`, message);
    return { sent: false, reason: message };
  }
}

/**
 * Fan out a newsletter issue (a published BlogPost) to every verified,
 * still-subscribed recipient for the matching kind.
 *
 * Dedupe: consults `NewsletterSubscription.lastSentAt` — a JSON column
 * shaped like `{ "monday-outlook": "2026-04-27T14:00:00.000Z", ... }`.
 * If we've already sent this kind to this address on or after
 * `publishedAt`, we skip. Makes the cron idempotent so re-running it
 * after a partial failure only picks up the recipients we missed.
 *
 * Fans out in batches of 50 (Resend's soft limit for parallel sends
 * before you hit rate limits). We don't use the batch API directly
 * because it caps at 100 per call AND each email shares the same
 * unsubscribe token, which doesn't fit our per-subscriber model.
 */
export async function sendNewsletterIssue(opts: {
  kind: string;
  kindLabel: string;
  post: {
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    publishedAt: Date;
  };
}): Promise<{
  totalRecipients: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
}> {
  if (!hasResend()) {
    console.warn(
      `[newsletter] RESEND_API_KEY missing — skipping issue send for ${opts.post.slug}`,
    );
    return { totalRecipients: 0, sent: 0, skipped: 0, failed: 0, reason: "no-key" };
  }
  const client = getResend()!;

  const subscribers = await prisma.newsletterSubscription.findMany({
    where: {
      verified: true,
      unsubscribedAt: null,
      kinds: { has: opts.kind },
    },
    select: {
      id: true,
      email: true,
      unsubscribeToken: true,
      lastSentAt: true,
    },
  });

  const publishedAtMs = opts.post.publishedAt.getTime();
  const postUrl = `${SITE_ORIGIN}/blog/${opts.post.slug}`;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // Batch the sends so we don't saturate Resend's API rate limits or
  // keep a single HTTP request open for 10 minutes waiting on 10k
  // serial send calls. Promise.allSettled in chunks keeps one failed
  // recipient from aborting the whole fan-out.
  const BATCH = 20;
  for (let i = 0; i < subscribers.length; i += BATCH) {
    const chunk = subscribers.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      chunk.map(async (sub) => {
        // Dedupe against lastSentAt for THIS kind.
        const prev = (sub.lastSentAt as Record<string, string> | null)?.[
          opts.kind
        ];
        if (prev && new Date(prev).getTime() >= publishedAtMs) {
          skipped++;
          return;
        }

        const { subject, html, text } = buildIssueEmail({
          title: opts.post.title,
          excerpt: opts.post.excerpt,
          bodyMarkdown: opts.post.content,
          postUrl,
          kindLabel: opts.kindLabel,
          unsubscribeUrl: unsubscribeUrl(sub.unsubscribeToken, opts.kind),
        });

        const { error } = await client.emails.send({
          from: SENDER_FROM,
          to: [sub.email],
          replyTo: SENDER_REPLY_TO,
          subject,
          html,
          text,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl(sub.unsubscribeToken, opts.kind)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        if (error) {
          failed++;
          console.error(
            `[newsletter] send to ${sub.email} failed:`,
            error.message,
          );
          return;
        }

        // Merge this kind's send timestamp into lastSentAt without
        // blowing away any other kind's history.
        const nextMap: Record<string, string> = {
          ...((sub.lastSentAt as Record<string, string> | null) ?? {}),
          [opts.kind]: new Date().toISOString(),
        };
        await prisma.newsletterSubscription.update({
          where: { id: sub.id },
          data: { lastSentAt: nextMap },
        });
        sent++;
      }),
    );
    // Anything that rejected outright (network error before we had a
    // chance to classify) goes in the "failed" bucket.
    for (const r of results) {
      if (r.status === "rejected") {
        failed++;
        console.error(`[newsletter] unhandled send rejection:`, r.reason);
      }
    }
  }

  return {
    totalRecipients: subscribers.length,
    sent,
    skipped,
    failed,
  };
}

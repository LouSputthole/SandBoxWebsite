import { prisma } from "@/lib/db";

/**
 * LoginEvent helper. Single entry point so the wire-format and the
 * "kind" enum stay consistent across callers (callback, logout,
 * session-revoke, anomaly detector).
 *
 * Failures are swallowed — an audit-log write that errors should never
 * block a successful login or logout. We log to console so an outage
 * is still visible in Vercel logs.
 */

export type LoginEventKind =
  | "login_success"
  | "login_failure"
  | "logout"
  | "session_revoked"
  | "session_revoked_all"
  | "session_anomaly";

export interface LoginEventInput {
  userId: string;
  kind: LoginEventKind;
  sessionId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  reason?: string | null;
}

export async function recordLoginEvent(input: LoginEventInput): Promise<void> {
  try {
    await prisma.loginEvent.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        sessionId: input.sessionId ?? null,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
        reason: input.reason ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record login event:", err);
  }
}

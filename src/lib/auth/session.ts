import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  hashIp,
  getClientIpFromHeaders,
  getUserAgentFromHeaders,
} from "@/lib/auth/fingerprint";
import { recordLoginEvent } from "@/lib/auth/audit";

const SESSION_COOKIE = "sboxskins_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// Don't update lastSeenAt on every single request — bursts of API
// calls would hammer the DB. Once a minute is enough to keep the
// "last seen" indicator on /account/sessions feeling fresh.
const LAST_SEEN_REFRESH_MS = 60 * 1000;

/**
 * Create a new session for a user. Sets an HTTP-only cookie and
 * snapshots the request fingerprint (hashed IP + UA) so anomaly
 * detection can compare future requests against the create-time state.
 * Returns the new session row's id so callers can write a LoginEvent
 * tied to it.
 */
export async function createSession(userId: string): Promise<{
  token: string;
  sessionId: string;
}> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

  const ip = await getClientIpFromHeaders();
  const userAgent = await getUserAgentFromHeaders();
  const ipHash = hashIp(ip);

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ipHash,
      userAgent,
      lastSeenAt: new Date(),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE / 1000,
  });

  return { token, sessionId: session.id };
}

/**
 * Get the current user from the session cookie.
 * Returns null if no valid session exists.
 *
 * Side effects:
 *   - Refreshes lastSeenAt (throttled, once per minute)
 *   - Compares the current request's fingerprint against session-create
 *     state; if BOTH ipHash and userAgent differ, writes a one-time
 *     session_anomaly LoginEvent so the user can spot it on
 *     /account/sessions. We don't auto-revoke — false positives
 *     (mobile roaming, device backups) would erode trust faster than
 *     a real attack would harm a user.
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  // Fingerprint diff + lastSeenAt refresh. Both are best-effort —
  // a hiccup here can't break auth.
  try {
    const currentIp = await getClientIpFromHeaders();
    const currentUa = await getUserAgentFromHeaders();
    const currentIpHash = hashIp(currentIp);

    const ipChanged =
      session.ipHash != null &&
      currentIpHash != null &&
      session.ipHash !== currentIpHash;
    const uaChanged =
      session.userAgent != null &&
      currentUa != null &&
      session.userAgent !== currentUa;

    if (ipChanged && uaChanged) {
      // Throttle anomaly logging — one event per session per 24h is
      // plenty (Lou will see it, no need to spam the table on every
      // mobile-roam request).
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await prisma.loginEvent.findFirst({
        where: {
          sessionId: session.id,
          kind: "session_anomaly",
          createdAt: { gte: dayAgo },
        },
        select: { id: true },
      });
      if (!recent) {
        await recordLoginEvent({
          userId: session.userId,
          sessionId: session.id,
          kind: "session_anomaly",
          ipHash: currentIpHash,
          userAgent: currentUa,
          reason: "ip+ua both changed since session create",
        });
      }
    }

    const stale = Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS;
    if (stale) {
      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[auth] session housekeeping failed:", err);
  }

  return session.user;
}

/**
 * Same as getCurrentUser but also returns the active session row, so
 * /account/sessions can mark "this is your current device."
 */
export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

/**
 * Destroy the current session (logout). Writes a logout event so the
 * audit log shows clean shutdowns alongside anomalies.
 */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const session = await prisma.session
      .findUnique({ where: { token }, select: { id: true, userId: true } })
      .catch(() => null);
    if (session) {
      await recordLoginEvent({
        userId: session.userId,
        sessionId: session.id,
        kind: "logout",
      });
    }
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
  }

  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Clean up expired sessions (call periodically).
 */
export async function cleanExpiredSessions() {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

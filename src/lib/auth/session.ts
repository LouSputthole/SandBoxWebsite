import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

const SESSION_COOKIE = "sboxskins_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Create a new session for a user. Sets an HTTP-only cookie.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE / 1000,
  });

  return token;
}

/**
 * Get the current user from the session cookie.
 * Returns null if no valid session exists.
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
    // Expired or invalid — clean up
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  return session.user;
}

/**
 * Destroy the current session (logout).
 */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
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

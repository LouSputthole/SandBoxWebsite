import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { SessionsPanel, type SerializedSession, type SerializedEvent } from "./sessions-panel";

export const metadata: Metadata = {
  title: "Account security",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountSessionsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/api/auth/steam?next=/account/sessions");
  }

  const [sessions, events] = await Promise.all([
    prisma.session.findMany({
      where: {
        userId: current.userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        ipHash: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    }),
    prisma.loginEvent.findMany({
      where: { userId: current.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        kind: true,
        reason: true,
        ipHash: true,
        userAgent: true,
        createdAt: true,
        sessionId: true,
      },
    }),
  ]);

  const initialSessions: SerializedSession[] = sessions.map((s) => ({
    id: s.id,
    isCurrent: s.id === current.id,
    ipHash: s.ipHash,
    userAgent: s.userAgent,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }));

  const initialEvents: SerializedEvent[] = events.map((e) => ({
    id: e.id,
    kind: e.kind,
    reason: e.reason,
    ipHash: e.ipHash,
    userAgent: e.userAgent,
    sessionId: e.sessionId,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-xs text-neutral-500 hover:text-white transition-colors"
        >
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Account security</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Active sessions and a recent login history. Anything you don&apos;t
          recognize, revoke it — and use the log-out-everywhere button as a
          full reset.
        </p>
      </div>
      <SessionsPanel
        currentSessionId={current.id}
        initialSessions={initialSessions}
        initialEvents={initialEvents}
      />
    </div>
  );
}

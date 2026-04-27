"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  Monitor,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Shield,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deviceLabel } from "@/lib/auth/device-label";

export interface SerializedSession {
  id: string;
  isCurrent: boolean;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface SerializedEvent {
  id: string;
  kind: string;
  reason: string | null;
  ipHash: string | null;
  userAgent: string | null;
  sessionId: string | null;
  createdAt: string;
}

interface SessionsPanelProps {
  currentSessionId: string;
  initialSessions: SerializedSession[];
  initialEvents: SerializedEvent[];
}

const KIND_LABEL: Record<string, string> = {
  login_success: "Logged in",
  login_failure: "Login failed",
  logout: "Logged out",
  session_revoked: "Session revoked",
  session_revoked_all: "Logged out everywhere else",
  session_anomaly: "Session anomaly",
};

const KIND_TONE: Record<string, string> = {
  login_success: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  login_failure: "text-red-300 border-red-500/30 bg-red-500/10",
  logout: "text-neutral-300 border-neutral-700 bg-neutral-800/40",
  session_revoked: "text-neutral-300 border-neutral-700 bg-neutral-800/40",
  session_revoked_all: "text-neutral-300 border-neutral-700 bg-neutral-800/40",
  session_anomaly: "text-amber-300 border-amber-500/40 bg-amber-500/10",
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function shortHash(h: string | null): string {
  if (!h) return "—";
  return h.slice(0, 8);
}

export function SessionsPanel({
  currentSessionId,
  initialSessions,
  initialEvents,
}: SessionsPanelProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [events, setEvents] = useState(initialEvents);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const hasAnomaly = events.some((e) => e.kind === "session_anomaly");

  async function refresh() {
    try {
      const [sRes, eRes] = await Promise.all([
        fetch("/api/account/sessions"),
        fetch("/api/account/login-events"),
      ]);
      if (sRes.ok) {
        const data = await sRes.json();
        setSessions(data.sessions);
      }
      if (eRes.ok) {
        const data = await eRes.json();
        setEvents(data.events);
      }
    } catch {
      /* keep stale state */
    }
  }

  async function revoke(id: string) {
    if (id === currentSessionId) {
      if (!confirm("This is your current device. Sign out here?")) return;
    } else {
      if (!confirm("Revoke this session? The other device will be signed out.")) {
        return;
      }
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/account/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      if (id === currentSessionId) {
        window.location.href = "/";
        return;
      }
      startTransition(() => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
      });
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAllOthers() {
    if (
      !confirm(
        "Sign out of every other device? You'll stay signed in here only.",
      )
    ) {
      return;
    }
    setBusyAll(true);
    setError(null);
    try {
      const res = await fetch("/api/account/sessions", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      startTransition(() => {
        setSessions((prev) => prev.filter((s) => s.id === currentSessionId));
      });
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasAnomaly && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-100">
            <p className="font-semibold">A session was used from a different network + device.</p>
            <p className="text-xs text-amber-200/80 mt-1">
              See the recent events below. If you don&apos;t recognize it,
              revoke that session and click{" "}
              <span className="font-semibold">Log out everywhere else</span>.
            </p>
          </div>
        </div>
      )}

      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-white">
                Active sessions
                <span className="text-neutral-500 font-normal ml-2">
                  {sessions.length}
                </span>
              </h2>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={revokeAllOthers}
              disabled={busyAll || sessions.length <= 1}
              className="gap-1.5 border-neutral-700 text-neutral-300 hover:text-red-300 hover:border-red-500/40"
            >
              {busyAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Log out everywhere else
            </Button>
          </div>
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={`rounded-lg border p-3 flex items-start justify-between gap-3 flex-wrap ${
                  s.isCurrent
                    ? "border-purple-500/40 bg-purple-500/5"
                    : "border-neutral-800 bg-neutral-950/40"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Monitor className="h-4 w-4 text-neutral-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white font-medium">
                        {deviceLabel(s.userAgent)}
                      </span>
                      {s.isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider text-purple-300 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>Last active {formatRelative(s.lastSeenAt)}</span>
                      <span>· created {formatRelative(s.createdAt)}</span>
                      <span className="font-mono text-neutral-600">
                        net {shortHash(s.ipHash)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revoke(s.id)}
                  disabled={busyId === s.id}
                  className="gap-1.5 border-neutral-700 text-neutral-400 hover:text-red-300 hover:border-red-500/40"
                >
                  {busyId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {s.isCurrent ? "Sign out" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        </CardContent>
      </Card>

      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">
              Recent activity
              <span className="text-neutral-500 font-normal ml-2">
                {events.length}
              </span>
            </h2>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-neutral-500">No events yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-800/60">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="py-2 flex items-start gap-3 flex-wrap"
                >
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                      KIND_TONE[e.kind] ??
                      "text-neutral-300 border-neutral-700 bg-neutral-800/40"
                    }`}
                  >
                    {KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  <div className="min-w-0 flex-1 flex items-center gap-3 flex-wrap text-[11px] text-neutral-500">
                    <span className="text-neutral-300">
                      {deviceLabel(e.userAgent)}
                    </span>
                    <span className="font-mono text-neutral-600">
                      net {shortHash(e.ipHash)}
                    </span>
                    {e.reason && (
                      <span className="text-neutral-500 italic">
                        {e.reason}
                      </span>
                    )}
                    <span className="ml-auto text-neutral-600">
                      {formatRelative(e.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

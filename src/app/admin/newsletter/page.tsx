"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Lock,
  Mail,
  Check,
  X,
  RefreshCw,
  Send,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface Subscriber {
  id: string;
  email: string;
  kinds: string[];
  verified: boolean;
  verifiedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
  lastSentAt: Record<string, string> | null;
}

interface RecentPost {
  slug: string;
  title: string;
  kind: string | null;
  publishedAt: string;
}

interface AdminData {
  totalRows: number;
  counts: { verified: number; unverified: number; unsubscribed: number };
  subscribers: Subscriber[];
  recentPosts: RecentPost[];
  hasResend: boolean;
}

const KIND_LABEL: Record<string, string> = {
  "monday-outlook": "Monday outlook",
  "friday-report": "Friday wrap",
  "weekly-report": "Friday wrap",
};

function statusOf(s: Subscriber): "verified" | "pending" | "unsubscribed" {
  if (s.unsubscribedAt) return "unsubscribed";
  if (s.verified) return "verified";
  return "pending";
}

const STATUS_STYLES: Record<
  "verified" | "pending" | "unsubscribed",
  string
> = {
  verified: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  unsubscribed: "bg-neutral-700/20 text-neutral-400 border-neutral-700/40",
};

/**
 * Newsletter admin dashboard — subscriber list, per-row actions, manual
 * fan-out. Designed to let the operator answer "is my email in here?"
 * and "send this week's issue to everyone" without psql access.
 */
export default function NewsletterAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "verified" | "pending" | "unsubscribed">(
    "all",
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [fanoutBusy, setFanoutBusy] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/newsletter", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as AdminData;
      setData(payload);
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (authed) void fetchData();
  }, [authed, fetchData]);

  async function runAction(id: string, action: string, extras: object = {}) {
    setPendingAction(`${id}:${action}`);
    try {
      const res = await fetch("/api/admin/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ id, action, ...extras }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        alert(`${action} failed: ${data.error ?? res.status}`);
        return;
      }
      await fetchData();
    } finally {
      setPendingAction(null);
    }
  }

  async function fanOut(kind: string) {
    if (!confirm(`Send the latest "${KIND_LABEL[kind] ?? kind}" issue to all verified subscribers?`)) {
      return;
    }
    setFanoutBusy(kind);
    try {
      // Reuse CRON_SECRET-gated cron route via a prefixed-auth-header
      // bridge — this admin page sends the analytics key, which the
      // cron endpoint rejects. So we route through the admin POST
      // endpoint with a custom action instead.
      //
      // Simplest path: call the cron directly. It's gated by
      // CRON_SECRET, which the admin UI doesn't have. So we kick the
      // fan-out from the server via a dedicated admin action.
      const res = await fetch(`/api/admin/newsletter/fanout?kind=${encodeURIComponent(kind)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
      });
      const result = await res.json();
      if (!res.ok) {
        alert(`Fan-out failed: ${result.error ?? res.status}`);
        return;
      }
      alert(
        `Sent: ${result.sent} · Skipped (already sent): ${result.skipped} · Failed: ${result.failed} · Total subscribers: ${result.totalRecipients}`,
      );
      await fetchData();
    } finally {
      setFanoutBusy(null);
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Newsletter admin</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Subscriber list, manual verify, fan-out controls.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAuthed(true);
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            placeholder="Admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!key}>
            Continue
          </Button>
        </form>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>
    );
  }

  const rows =
    data?.subscribers.filter((s) => {
      if (filter === "all") return true;
      return statusOf(s) === filter;
    }) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-purple-400" />
            Newsletter
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {data?.totalRows ?? 0} subscribers total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!data?.hasResend && (
        <Card className="bg-amber-500/5 border-amber-500/30 mb-4">
          <CardContent className="p-4 text-sm text-amber-200/90 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-300" />
            <div>
              <p className="font-medium text-amber-200">
                RESEND_API_KEY is not set.
              </p>
              <p className="text-amber-200/80 mt-1">
                Subscribers are being captured, but no email is being sent.
                Set the env var in Vercel and add a verified sending domain at
                resend.com to turn on delivery.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat pills */}
      {data && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatPill label="Verified" value={data.counts.verified} tone="verified" />
          <StatPill label="Pending" value={data.counts.unverified} tone="pending" />
          <StatPill
            label="Unsubscribed"
            value={data.counts.unsubscribed}
            tone="unsubscribed"
          />
        </div>
      )}

      {/* Fan-out controls */}
      {data && data.recentPosts.length > 0 && (
        <Card className="bg-neutral-900/60 border-neutral-800 mb-6">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
              Manual fan-out
            </p>
            <div className="flex flex-wrap gap-2">
              {["monday-outlook", "friday-report"].map((kind) => {
                const post = data.recentPosts.find((p) => {
                  if (kind === "friday-report") {
                    return p.kind === "friday-report" || p.kind === "weekly-report";
                  }
                  return p.kind === kind;
                });
                return (
                  <Button
                    key={kind}
                    variant="outline"
                    size="sm"
                    disabled={!post || fanoutBusy != null}
                    onClick={() => fanOut(kind)}
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {fanoutBusy === kind ? "Sending…" : `Send ${KIND_LABEL[kind] ?? kind}`}
                    {post && (
                      <span className="ml-2 text-[10px] text-neutral-500 truncate max-w-[160px]">
                        — {post.title.slice(0, 30)}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-neutral-600">
              Uses the latest published post of that kind. Dedupes against{" "}
              <code>lastSentAt</code> so re-running won't double-send.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(["all", "verified", "pending", "unsubscribed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
              filter === f
                ? "bg-purple-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            {f}
            {data && (
              <span className="ml-1.5 text-[10px] opacity-70">
                {f === "all"
                  ? data.subscribers.length
                  : data.subscribers.filter((s) => statusOf(s) === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Subscriber table */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Kinds</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Added</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const status = statusOf(s);
                const isBusy = pendingAction?.startsWith(`${s.id}:`);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-neutral-900 last:border-0"
                  >
                    <td className="px-4 py-3 text-white font-mono text-xs">
                      {s.email}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {s.kinds.length > 0 ? s.kinds.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_STYLES[status]}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      {status === "pending" && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => runAction(s.id, "verify")}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-300 px-2 py-1 text-[11px]"
                          >
                            <Check className="h-3 w-3" />
                            Verify
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !data?.hasResend}
                            onClick={() => runAction(s.id, "resend-verify")}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-700 hover:border-purple-500/40 text-neutral-400 hover:text-white px-2 py-1 text-[11px] disabled:opacity-40"
                            title={
                              !data?.hasResend
                                ? "Set RESEND_API_KEY first"
                                : undefined
                            }
                          >
                            <Send className="h-3 w-3" />
                            Resend link
                          </button>
                        </>
                      )}
                      {status !== "unsubscribed" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            if (confirm(`Unsubscribe ${s.email}?`)) {
                              runAction(s.id, "unsubscribe");
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 hover:border-red-500/40 text-neutral-400 hover:text-red-300 px-2 py-1 text-[11px]"
                        >
                          <X className="h-3 w-3" />
                          Unsub
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-neutral-500"
                  >
                    No subscribers match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "verified" | "pending" | "unsubscribed";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${STATUS_STYLES[tone]}`}
    >
      <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">
        {label}
      </p>
      <p className="text-xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

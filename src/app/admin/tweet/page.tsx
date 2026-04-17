"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Lock,
  RefreshCw,
  Send,
  Check,
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Megaphone,
  BarChart3,
  Clock,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface Draft {
  kind: string;
  text: string;
  itemSlug?: string;
  approxLength: number;
}

interface TweetResult {
  success: boolean;
  tweetUrl?: string;
  error?: string;
  scheduledFor?: string; // ISO timestamp if this was scheduled instead of posted
}

interface Mention {
  tweet: {
    id: string;
    text: string;
    createdAt: string;
    authorUsername: string;
    authorName: string;
    tweetUrl: string;
  };
  replies: string[];
  matchedItemName?: string;
  reason: string;
}

interface ScheduledTweet {
  id: string;
  text: string;
  scheduledFor: string;
  status: string;
  kind: string | null;
  itemSlug: string | null;
  inReplyToTweetId: string | null;
  postedTweetId: string | null;
  failureReason: string | null;
  attemptedAt: string | null;
  createdAt: string;
}

/** Hours offsets for the quick-schedule buttons on each draft row. Keep
 * values sorted and under 6 entries to avoid button-row overflow on
 * mobile. Adding more? Drop the least-used first. */
const QUICK_SCHEDULE_HOURS: readonly number[] = [1, 1.5, 2, 4, 5];

const KIND_LABELS: Record<string, string> = {
  "top-gainer": "Top Gainer (24h)",
  "top-loser": "Top Loser (24h)",
  rarest: "Rarest Skin",
  "market-cap": "Market Snapshot",
  "item-spotlight": "Item Spotlight",
  "limited-edition": "Limited Edition",
  "weekly-gainer": "Weekly Gainer (7d)",
  "weekly-loser": "Weekly Loser (7d)",
  "weekly-recap": "Weekly Recap",
  "weekly-market-change": "Weekly Market Change",
  "market-insight": "Market Insight",
};

function formatTweetTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Little pill that shows how stale the underlying market data is. Green up
 * to 45 min (sync runs every 15-30 min, so anything that old is a missed
 * run), amber up to 3h, red past that — at which point the drafts are
 * quoting prices that might not match reality. Full ISO timestamp is in
 * the title attribute for hover. Re-ticks every 30s so the label stays
 * live without needing a page refresh.
 */
function DataFreshness({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Mount + interval tick — the set-state-in-effect rule is over-eager
    // for time-based UI refreshes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // SSR-safe: render a neutral pill until the client ticks once.
  if (now === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium bg-neutral-800 text-neutral-400 border-neutral-700">
        <RefreshCw className="h-3 w-3" />
        Data …
      </span>
    );
  }
  const ageMin = (now - new Date(iso).getTime()) / 60_000;
  const tone =
    ageMin < 45
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : ageMin < 180
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : "bg-red-500/10 text-red-300 border-red-500/40";
  return (
    <span
      title={`Last sync: ${new Date(iso).toLocaleString()}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      <RefreshCw className="h-3 w-3" />
      Data {formatTweetTime(iso)}
    </span>
  );
}

export default function TweetAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<"drafts" | "mentions" | "scheduled">("drafts");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // ISO timestamp of the freshest item.updatedAt in the DB — shown in the
  // header so you can tell at a glance whether these drafts are built from
  // fresh sync data or something stale.
  const [dataUpdatedAt, setDataUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postingIndex, setPostingIndex] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, TweetResult>>({});
  const [customText, setCustomText] = useState("");
  const [customResult, setCustomResult] = useState<TweetResult | null>(null);
  const [postingCustom, setPostingCustom] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // Per-draft custom-time picker state. customDraftIndex tracks which
  // draft row has its datetime-local input open; customDraftTime holds
  // the current input value (browser-local ISO without TZ).
  const [customDraftIndex, setCustomDraftIndex] = useState<number | null>(null);
  const [customDraftTime, setCustomDraftTime] = useState("");

  // Mentions/replies state
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionsError, setMentionsError] = useState<string | null>(null);
  // Per-mention UI state, keyed by tweet id
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyResult, setReplyResult] = useState<Record<string, TweetResult>>({});
  const [posting, setPosting] = useState<string | null>(null);

  // Scheduling state
  const [scheduled, setScheduled] = useState<ScheduledTweet[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState<string | null>(null);
  const [showCustomSchedule, setShowCustomSchedule] = useState(false);
  const [customScheduleTime, setCustomScheduleTime] = useState("");
  const [schedulingCustom, setSchedulingCustom] = useState(false);

  const fetchDrafts = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tweet", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setDrafts(data.drafts ?? []);
      setDataUpdatedAt(data.dataUpdatedAt ?? null);
      setAuthed(true);
      setResults({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [key]);

  const postDraft = async (index: number, text: string) => {
    setPostingIndex(index);
    try {
      const res = await fetch("/api/admin/tweet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [index]: data }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [index]: { success: false, error: err instanceof Error ? err.message : "Failed" },
      }));
    } finally {
      setPostingIndex(null);
    }
  };

  const postCustom = async () => {
    if (!customText.trim()) return;
    setPostingCustom(true);
    setCustomResult(null);
    try {
      const res = await fetch("/api/admin/tweet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ text: customText }),
      });
      setCustomResult(await res.json());
    } catch (err) {
      setCustomResult({ success: false, error: err instanceof Error ? err.message : "Failed" });
    } finally {
      setPostingCustom(false);
    }
  };

  const copyDraft = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      // ignore
    }
  };

  /**
   * Schedule a draft for a specific ISO timestamp. Shared core used by
   * both the quick-schedule buttons (below) and the per-draft custom-
   * time picker. Fractional hours work natively thanks to JS numbers
   * (e.g. 1.5 → 90 min).
   */
  const scheduleDraftAt = async (index: number, draft: Draft, scheduledFor: string) => {
    setPostingIndex(index);
    try {
      const res = await fetch("/api/admin/tweet/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          text: draft.text,
          scheduledFor,
          kind: draft.kind,
          itemSlug: draft.itemSlug,
        }),
      });
      const data = await res.json();
      setResults((prev) => ({
        ...prev,
        [index]: res.ok
          ? { success: true, scheduledFor: scheduledFor }
          : { success: false, error: data.error || "Failed to schedule" },
      }));
      if (res.ok && scheduled.length > 0) fetchScheduled();
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [index]: { success: false, error: err instanceof Error ? err.message : "Failed" },
      }));
    } finally {
      setPostingIndex(null);
    }
  };

  /** Quick-schedule a draft for N hours from now (supports fractional). */
  const scheduleDraftInHours = (index: number, draft: Draft, hours: number) => {
    const iso = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    return scheduleDraftAt(index, draft, iso);
  };

  const fetchMentions = useCallback(async () => {
    if (!key) return;
    setMentionsLoading(true);
    setMentionsError(null);
    try {
      const res = await fetch("/api/admin/tweet/mentions", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const list: Mention[] = data.mentions ?? [];
      setMentions(list);
      // Pre-fill reply text with first draft
      const prefill: Record<string, string> = {};
      for (const m of list) {
        if (m.replies[0]) prefill[m.tweet.id] = m.replies[0];
      }
      setReplyText(prefill);
      setReplyResult({});
    } catch (err) {
      setMentionsError(err instanceof Error ? err.message : "Failed");
    } finally {
      setMentionsLoading(false);
    }
  }, [key]);

  // ---- Scheduled tweet helpers ----

  const fetchScheduled = useCallback(async () => {
    if (!key) return;
    setScheduledLoading(true);
    setScheduledError(null);
    try {
      const res = await fetch("/api/admin/tweet/schedule", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setScheduled(data.scheduled ?? []);
    } catch (err) {
      setScheduledError(err instanceof Error ? err.message : "Failed");
    } finally {
      setScheduledLoading(false);
    }
  }, [key]);

  const scheduleCustom = async () => {
    if (!customText.trim() || !customScheduleTime) return;
    setSchedulingCustom(true);
    setCustomResult(null);
    try {
      // datetime-local gives a value like "2026-04-15T18:30" — convert to ISO
      const scheduledFor = new Date(customScheduleTime).toISOString();
      const res = await fetch("/api/admin/tweet/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ text: customText, scheduledFor, kind: "custom" }),
      });
      const data = await res.json();
      if (res.ok) {
        setCustomResult({ success: true });
        setCustomText("");
        setCustomScheduleTime("");
        setShowCustomSchedule(false);
        // Refresh the scheduled list if it's been loaded
        if (scheduled.length > 0) fetchScheduled();
      } else {
        setCustomResult({ success: false, error: data.error || "Failed to schedule" });
      }
    } catch (err) {
      setCustomResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed to schedule",
      });
    } finally {
      setSchedulingCustom(false);
    }
  };

  const cancelScheduled = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tweet/schedule?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        // Optimistic update
        setScheduled((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "cancelled" } : s)),
        );
      }
    } catch {
      // ignore
    }
  };

  const sendReply = async (tweetId: string) => {
    const text = replyText[tweetId];
    if (!text?.trim()) return;
    setPosting(tweetId);
    try {
      const res = await fetch("/api/admin/tweet/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ text, inReplyToTweetId: tweetId }),
      });
      const data = await res.json();
      setReplyResult((prev) => ({ ...prev, [tweetId]: data }));
    } catch (err) {
      setReplyResult((prev) => ({
        ...prev,
        [tweetId]: { success: false, error: err instanceof Error ? err.message : "Failed" },
      }));
    } finally {
      setPosting(null);
    }
  };

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 py-20">
        <Card className="bg-neutral-900">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="h-6 w-6 text-purple-400" />
              <h1 className="text-xl font-bold text-white">Tweet Admin</h1>
            </div>
            <p className="text-sm text-neutral-400 mb-4">
              Enter your admin key to access the tweet drafter.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchDrafts();
              }}
              className="space-y-3"
            >
              <Input
                type="password"
                placeholder="Admin key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button
                type="submit"
                disabled={!key || loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Unlock
              </Button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tweet Admin</h1>
          <p className="text-sm text-neutral-500 mt-1">
            For @SboxSkinsgg. Post generated drafts or reply to recent S&box mentions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/tweet/stats">
            <Button variant="outline" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Stats
            </Button>
          </Link>
          {activeTab === "drafts" && (
            <>
              {dataUpdatedAt && (
                <DataFreshness iso={dataUpdatedAt} />
              )}
              <Button onClick={fetchDrafts} disabled={loading} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
            </>
          )}
          {activeTab === "mentions" && (
            <Button
              onClick={fetchMentions}
              disabled={mentionsLoading}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${mentionsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
          {activeTab === "scheduled" && (
            <Button
              onClick={fetchScheduled}
              disabled={scheduledLoading}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${scheduledLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-neutral-900 border border-neutral-800 w-fit">
        <button
          onClick={() => setActiveTab("drafts")}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            activeTab === "drafts"
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Megaphone className="h-3.5 w-3.5" />
          Drafts
        </button>
        <button
          onClick={() => {
            setActiveTab("mentions");
            if (mentions.length === 0) fetchMentions();
          }}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            activeTab === "mentions"
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Mentions &amp; Replies
          {mentions.length > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
              {mentions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab("scheduled");
            if (scheduled.length === 0) fetchScheduled();
          }}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            activeTab === "scheduled"
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Scheduled
          {scheduled.filter((s) => s.status === "pending").length > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
              {scheduled.filter((s) => s.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {error && activeTab === "drafts" && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {activeTab === "drafts" && (
      <>
      <div className="space-y-4 mb-12">
        {drafts.map((draft, index) => (
          <Card key={`${draft.kind}-${index}`} className="bg-neutral-900">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium">
                    {KIND_LABELS[draft.kind] ?? draft.kind}
                  </span>
                  <span
                    className={`text-xs ${
                      draft.approxLength > 280 ? "text-red-400" : "text-neutral-500"
                    }`}
                  >
                    ~{draft.approxLength} chars
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyDraft(index, draft.text)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
                    aria-label="Copy"
                  >
                    {copiedIndex === index ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-sans leading-relaxed mb-4">
                {draft.text}
              </pre>

              {results[index] ? (
                results[index].success ? (
                  results[index].scheduledFor ? (
                    <div className="flex items-center gap-2 text-sm text-cyan-400">
                      <Clock className="h-4 w-4" />
                      Scheduled for{" "}
                      {new Date(results[index].scheduledFor!).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                      <Check className="h-4 w-4" />
                      Posted!
                      {results[index].tweetUrl && (
                        <a
                          href={results[index].tweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-300 hover:underline"
                        >
                          View on X
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )
                ) : (
                  <div className="flex items-start gap-2 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{results[index].error}</span>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => postDraft(index, draft.text)}
                      disabled={postingIndex === index || draft.approxLength > 280}
                      className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                      size="sm"
                    >
                      {postingIndex === index ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Post now
                    </Button>
                    {QUICK_SCHEDULE_HOURS.map((h) => (
                      <Button
                        key={h}
                        onClick={() => scheduleDraftInHours(index, draft, h)}
                        disabled={postingIndex === index || draft.approxLength > 280}
                        variant="outline"
                        className="gap-1.5 border-neutral-700 text-neutral-300 hover:text-white px-2.5"
                        size="sm"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        +{h}h
                      </Button>
                    ))}
                    <Button
                      onClick={() =>
                        setCustomDraftIndex(customDraftIndex === index ? null : index)
                      }
                      disabled={postingIndex === index || draft.approxLength > 280}
                      variant="outline"
                      className={`gap-1.5 px-2.5 ${
                        customDraftIndex === index
                          ? "border-purple-500/50 bg-purple-500/10 text-purple-200"
                          : "border-neutral-700 text-neutral-300 hover:text-white"
                      }`}
                      size="sm"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Custom…
                    </Button>
                  </div>
                  {customDraftIndex === index && (
                    <div className="flex items-center gap-2 p-2 rounded-lg border border-purple-500/30 bg-purple-500/5">
                      <Clock className="h-4 w-4 text-purple-400 shrink-0" />
                      <input
                        type="datetime-local"
                        value={customDraftTime}
                        onChange={(e) => setCustomDraftTime(e.target.value)}
                        className="flex-1 min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500"
                      />
                      <Button
                        onClick={() => {
                          if (!customDraftTime) return;
                          scheduleDraftAt(index, draft, new Date(customDraftTime).toISOString());
                          setCustomDraftIndex(null);
                          setCustomDraftTime("");
                        }}
                        disabled={!customDraftTime || postingIndex === index}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        Schedule
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Custom tweet composer */}
      <div className="border-t border-neutral-800 pt-8">
        <h2 className="text-lg font-semibold text-white mb-3">Custom tweet</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Write your own tweet — URLs count as 23 characters each at post time.
        </p>
        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Write a tweet..."
          rows={5}
          maxLength={280}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span
            className={`text-xs ${
              customText.length > 260
                ? "text-red-400"
                : customText.length > 240
                  ? "text-amber-400"
                  : "text-neutral-500"
            }`}
          >
            {customText.length} / 280
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowCustomSchedule((v) => !v)}
              variant="outline"
              className="gap-2"
              disabled={!customText.trim() || customText.length > 280}
            >
              <Clock className="h-4 w-4" />
              {showCustomSchedule ? "Cancel schedule" : "Schedule for later"}
            </Button>
            <Button
              onClick={postCustom}
              disabled={!customText.trim() || postingCustom || customText.length > 280}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {postingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post now
            </Button>
          </div>
        </div>

        {showCustomSchedule && (
          <div className="mt-3 p-4 rounded-lg border border-purple-500/30 bg-purple-500/5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-400" />
              <input
                type="datetime-local"
                value={customScheduleTime}
                onChange={(e) => setCustomScheduleTime(e.target.value)}
                className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500"
              />
            </div>
            <Button
              onClick={scheduleCustom}
              disabled={!customScheduleTime || schedulingCustom}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
              size="sm"
            >
              {schedulingCustom ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              Schedule
            </Button>
          </div>
        )}
        {customResult && (
          <div className="mt-3">
            {customResult.success ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <Check className="h-4 w-4" />
                Posted!
                {customResult.tweetUrl && (
                  <a
                    href={customResult.tweetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-300 hover:underline"
                  >
                    View on X
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{customResult.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {/* Mentions tab */}
      {activeTab === "mentions" && (
        <div>
          {mentionsError && (
            <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{mentionsError}</p>
            </div>
          )}

          {mentionsLoading && mentions.length === 0 && (
            <div className="flex items-center justify-center gap-2 text-neutral-500 py-16">
              <Loader2 className="h-5 w-5 animate-spin" />
              Searching recent S&box tweets...
            </div>
          )}

          {!mentionsLoading && mentions.length === 0 && !mentionsError && (
            <div className="text-center text-neutral-500 py-16">
              <MessageCircle className="h-10 w-10 mx-auto mb-3 text-neutral-700" />
              <p className="text-sm">No recent S&box mentions found.</p>
              <p className="text-xs mt-1 text-neutral-600">
                We search for @SboxSkinsgg, &ldquo;s&amp;box&rdquo;, &ldquo;sbox skins&rdquo;, and related keywords.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {mentions.map((m) => {
              const tweetId = m.tweet.id;
              const currentText = replyText[tweetId] ?? "";
              const res = replyResult[tweetId];
              return (
                <Card key={tweetId} className="bg-neutral-900">
                  <CardContent className="p-5">
                    {/* Original tweet */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {m.tweet.authorName}
                          </span>
                          <span className="text-xs text-neutral-500">
                            @{m.tweet.authorUsername}
                          </span>
                          <span className="text-xs text-neutral-600">·</span>
                          <span className="text-xs text-neutral-500">
                            {formatTweetTime(m.tweet.createdAt)}
                          </span>
                        </div>
                        <a
                          href={m.tweet.tweetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-neutral-500 hover:text-white transition inline-flex items-center gap-1"
                        >
                          View on X
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-sans leading-relaxed rounded-lg bg-neutral-950/60 border border-neutral-800 p-3">
                        {m.tweet.text}
                      </pre>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-neutral-500">
                        <span className="px-2 py-0.5 rounded-full bg-neutral-800">
                          {m.reason}
                        </span>
                      </div>
                    </div>

                    {/* Reply drafts — clickable chips */}
                    <div className="mb-3">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                        Draft replies — click to use
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {m.replies.map((r, i) => (
                          <button
                            key={i}
                            onClick={() =>
                              setReplyText((prev) => ({ ...prev, [tweetId]: r }))
                            }
                            className={`text-xs text-left px-3 py-2 rounded-lg border transition max-w-full ${
                              currentText === r
                                ? "bg-purple-500/10 border-purple-500/40 text-purple-200"
                                : "bg-neutral-950/40 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Editable reply */}
                    <textarea
                      value={currentText}
                      onChange={(e) =>
                        setReplyText((prev) => ({ ...prev, [tweetId]: e.target.value }))
                      }
                      placeholder="Write a reply..."
                      rows={3}
                      maxLength={280}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 resize-none"
                    />

                    <div className="flex items-center justify-between mt-3">
                      <span
                        className={`text-xs ${
                          currentText.length > 260
                            ? "text-red-400"
                            : currentText.length > 240
                              ? "text-amber-400"
                              : "text-neutral-500"
                        }`}
                      >
                        {currentText.length} / 280
                      </span>
                      {res ? (
                        res.success ? (
                          <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <Check className="h-4 w-4" />
                            Posted!
                            {res.tweetUrl && (
                              <a
                                href={res.tweetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-300 hover:underline"
                              >
                                View
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 text-sm text-red-400">
                            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>{res.error}</span>
                          </div>
                        )
                      ) : (
                        <Button
                          onClick={() => sendReply(tweetId)}
                          disabled={
                            !currentText.trim() ||
                            posting === tweetId ||
                            currentText.length > 280
                          }
                          className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                          size="sm"
                        >
                          {posting === tweetId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Send reply
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Scheduled tab */}
      {activeTab === "scheduled" && (
        <div>
          {scheduledError && (
            <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{scheduledError}</p>
            </div>
          )}

          {scheduledLoading && scheduled.length === 0 && (
            <div className="flex items-center justify-center gap-2 text-neutral-500 py-16">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading scheduled tweets...
            </div>
          )}

          {!scheduledLoading && scheduled.length === 0 && !scheduledError && (
            <div className="text-center text-neutral-500 py-16">
              <Clock className="h-10 w-10 mx-auto mb-3 text-neutral-700" />
              <p className="text-sm">No scheduled tweets yet.</p>
              <p className="text-xs mt-1 text-neutral-600">
                Use the &ldquo;Schedule for later&rdquo; button on the Drafts tab&apos;s custom composer.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {scheduled.map((s) => {
              const when = new Date(s.scheduledFor);
              const isPast = when.getTime() < Date.now();
              const statusColor =
                s.status === "posted"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : s.status === "failed"
                    ? "bg-red-500/20 text-red-300"
                    : s.status === "cancelled"
                      ? "bg-neutral-500/20 text-neutral-400"
                      : isPast
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-purple-500/20 text-purple-300";
              const statusLabel =
                s.status === "pending" && isPast ? "due (next dispatch)" : s.status;

              return (
                <Card key={s.id} className="bg-neutral-900">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium ${statusColor}`}
                        >
                          {statusLabel}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {when.toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        {s.kind && s.kind !== "scheduled" && (
                          <span className="text-[10px] text-neutral-500">{s.kind}</span>
                        )}
                      </div>
                      {s.status === "pending" && (
                        <button
                          onClick={() => cancelScheduled(s.id)}
                          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-red-400 transition"
                          aria-label="Cancel"
                        >
                          <X className="h-3 w-3" />
                          Cancel
                        </button>
                      )}
                      {s.status === "posted" && s.postedTweetId && (
                        <a
                          href={`https://x.com/SboxSkinsgg/status/${s.postedTweetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline"
                        >
                          View on X
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-sans leading-relaxed">
                      {s.text}
                    </pre>
                    {s.failureReason && (
                      <p className="mt-2 text-xs text-red-400">
                        <span className="font-medium">Error:</span> {s.failureReason}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-[11px] text-neutral-600 text-center mt-6">
            Dispatcher runs every 5 minutes. Tweets fire within 5 min of their scheduled time.
          </p>
        </div>
      )}
    </div>
  );
}

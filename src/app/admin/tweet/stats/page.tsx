"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Lock,
  RefreshCw,
  ArrowLeft,
  ExternalLink,
  MousePointerClick,
  Send,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface SentTweet {
  id: string;
  tweetId: string;
  text: string;
  kind: string | null;
  itemSlug: string | null;
  inReplyToTweetId: string | null;
  sentAt: string;
  estimatedClicks: number;
  targetPath: string;
}

interface StatsData {
  period: string;
  totalTweets: number;
  totalTcoClicks: number;
  uniquePathsReferred: number;
  kindCounts: Record<string, number>;
  clicksByPath: { path: string; count: number }[];
  tweets: SentTweet[];
}

const PERIODS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const KIND_LABELS: Record<string, string> = {
  "top-gainer": "Top Gainer (24h)",
  "top-loser": "Top Loser (24h)",
  rarest: "Rarest",
  "market-cap": "Market Snapshot",
  "item-spotlight": "Spotlight",
  "limited-edition": "Limited Edition",
  "weekly-gainer": "Weekly Gainer",
  "weekly-loser": "Weekly Loser",
  "weekly-recap": "Weekly Recap",
  "weekly-market-change": "Weekly Market Δ",
  reply: "Reply",
  custom: "Custom",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TweetStatsPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (p: string) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/tweet/stats?key=${encodeURIComponent(key)}&period=${p}`,
      );
      if (res.status === 401) {
        setAuthed(false);
        setError("Wrong admin key");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (authed) fetchStats(period);
  }, [period, authed, fetchStats]);

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 py-20">
        <Card className="bg-neutral-900">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="h-6 w-6 text-purple-400" />
              <h1 className="text-xl font-bold text-white">Tweet Stats</h1>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchStats(period);
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
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/admin/tweet"
            className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Tweet Admin
          </Link>
          <h1 className="text-2xl font-bold text-white">Tweet Performance</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Sent tweets and t.co click attribution from site analytics.
          </p>
        </div>
        <Button
          onClick={() => fetchStats(period)}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-neutral-900 border border-neutral-800 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              period === p.value
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <Card className="bg-neutral-900">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1 text-neutral-500">
                  <Send className="h-4 w-4" />
                  <span className="text-xs">Tweets sent</span>
                </div>
                <div className="text-2xl font-bold text-white">{data.totalTweets}</div>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1 text-neutral-500">
                  <MousePointerClick className="h-4 w-4" />
                  <span className="text-xs">Total t.co clicks</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">{data.totalTcoClicks}</div>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1 text-neutral-500">
                  <ExternalLink className="h-4 w-4" />
                  <span className="text-xs">Unique pages reached</span>
                </div>
                <div className="text-2xl font-bold text-white">{data.uniquePathsReferred}</div>
              </CardContent>
            </Card>
          </div>

          {/* Kind breakdown */}
          {Object.keys(data.kindCounts).length > 0 && (
            <Card className="bg-neutral-900 mb-8">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-white mb-3">Tweets by type</h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.kindCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([kind, count]) => (
                      <div
                        key={kind}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-800 text-sm"
                      >
                        <span className="text-neutral-300">{KIND_LABELS[kind] ?? kind}</span>
                        <span className="text-neutral-500 text-xs">{count}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top clicked pages */}
          {data.clicksByPath.length > 0 && (
            <Card className="bg-neutral-900 mb-8">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-white mb-3">
                  Top pages reached via t.co
                </h2>
                <div className="space-y-1.5">
                  {data.clicksByPath.map((p) => (
                    <div
                      key={p.path}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-neutral-800/40 transition"
                    >
                      <Link
                        href={p.path}
                        target="_blank"
                        className="text-sm text-neutral-300 hover:text-white truncate flex items-center gap-1.5"
                      >
                        {p.path}
                        <ExternalLink className="h-3 w-3 text-neutral-600 flex-shrink-0" />
                      </Link>
                      <span className="text-sm font-semibold text-emerald-400 flex-shrink-0">
                        {p.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tweets with attribution */}
          <Card className="bg-neutral-900">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-white mb-3">
                Sent tweets{" "}
                <span className="text-xs font-normal text-neutral-500">
                  ({data.tweets.length})
                </span>
              </h2>
              {data.tweets.length === 0 ? (
                <p className="text-sm text-neutral-500 py-8 text-center">
                  No tweets sent in this window yet. Post from{" "}
                  <Link href="/admin/tweet" className="text-purple-400 hover:underline">
                    the tweet admin
                  </Link>{" "}
                  and they&apos;ll show up here.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.tweets.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.kind && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 uppercase tracking-wide font-medium">
                              {KIND_LABELS[t.kind] ?? t.kind}
                            </span>
                          )}
                          <span className="text-xs text-neutral-500">
                            {formatRelative(t.sentAt)}
                          </span>
                          {t.inReplyToTweetId && (
                            <span className="text-[10px] text-neutral-500">
                              ↪ reply
                            </span>
                          )}
                        </div>
                        <a
                          href={`https://x.com/SboxSkinsgg/status/${t.tweetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-neutral-500 hover:text-white transition inline-flex items-center gap-1 flex-shrink-0"
                        >
                          View on X
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-sans leading-relaxed mb-3">
                        {t.text}
                      </pre>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500">
                          → <code className="text-neutral-400">{t.targetPath}</code>
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <MousePointerClick className="h-3 w-3" />
                          {t.estimatedClicks} click{t.estimatedClicks === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-[11px] text-neutral-600 text-center mt-6 leading-relaxed">
            Click attribution = pageviews with referrer containing &ldquo;t.co&rdquo; to the
            tweet&apos;s target path, after it was sent. Heuristic — multiple tweets to the same
            page will each show the same click count.
          </p>
        </>
      )}
    </div>
  );
}

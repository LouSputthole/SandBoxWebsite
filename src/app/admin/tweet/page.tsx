"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
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

const KIND_LABELS: Record<string, string> = {
  "top-gainer": "Top Gainer",
  "top-loser": "Top Loser",
  rarest: "Rarest Skin",
  "market-cap": "Market Snapshot",
  "item-spotlight": "Item Spotlight",
  "limited-edition": "Limited Edition",
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

export default function TweetAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<"drafts" | "mentions">("drafts");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postingIndex, setPostingIndex] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, TweetResult>>({});
  const [customText, setCustomText] = useState("");
  const [customResult, setCustomResult] = useState<TweetResult | null>(null);
  const [postingCustom, setPostingCustom] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Mentions/replies state
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionsError, setMentionsError] = useState<string | null>(null);
  // Per-mention UI state, keyed by tweet id
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyResult, setReplyResult] = useState<Record<string, TweetResult>>({});
  const [posting, setPosting] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tweet?key=${encodeURIComponent(key)}`);
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

  const fetchMentions = useCallback(async () => {
    if (!key) return;
    setMentionsLoading(true);
    setMentionsError(null);
    try {
      const res = await fetch(`/api/admin/tweet/mentions?key=${encodeURIComponent(key)}`);
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
        {activeTab === "drafts" ? (
          <Button onClick={fetchDrafts} disabled={loading} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Regenerate
          </Button>
        ) : (
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
                ) : (
                  <div className="flex items-start gap-2 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{results[index].error}</span>
                  </div>
                )
              ) : (
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
                  Post to @SboxSkinsgg
                </Button>
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
          <Button
            onClick={postCustom}
            disabled={!customText.trim() || postingCustom || customText.length > 280}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {postingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Post
          </Button>
        </div>
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
    </div>
  );
}

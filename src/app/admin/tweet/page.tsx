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

const KIND_LABELS: Record<string, string> = {
  "top-gainer": "Top Gainer",
  "top-loser": "Top Loser",
  rarest: "Rarest Skin",
  "market-cap": "Market Snapshot",
  "item-spotlight": "Item Spotlight",
  "limited-edition": "Limited Edition",
};

export default function TweetAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postingIndex, setPostingIndex] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, TweetResult>>({});
  const [customText, setCustomText] = useState("");
  const [customResult, setCustomResult] = useState<TweetResult | null>(null);
  const [postingCustom, setPostingCustom] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Tweet Admin</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Generated drafts for @SboxSkinsgg. Review, edit, and post.
          </p>
        </div>
        <Button onClick={fetchDrafts} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Regenerate
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

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
    </div>
  );
}

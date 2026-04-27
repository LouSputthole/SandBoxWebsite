"use client";

import { useState, useCallback } from "react";
import {
  Lock,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface SubredditPick {
  name: string;
  reason: string;
  risk: "low" | "medium" | "high";
}

interface RedditDraft {
  kind: string;
  title: string;
  body: string;
  subreddits: SubredditPick[];
  imageUrl?: string;
  link?: string;
}

const KIND_LABELS: Record<string, string> = {
  "weekly-analysis": "Weekly Market Analysis",
  "item-spotlight": "Item Spotlight",
  "scarcity-guide": "Scarcity Guide",
  "whale-watch": "Whale Watch",
  "store-rotation": "Store Rotation",
};

const RISK_STYLES: Record<"low" | "medium" | "high", string> = {
  low: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  high: "bg-red-500/10 text-red-300 border-red-500/30",
};

/**
 * Reddit post admin UI. Mirrors the tweet admin's rhythm: login →
 * fetch drafts → copy title/body/image URL per post, with subreddit
 * recommendations and risk labels so the admin can pick which post
 * goes where.
 *
 * Why not auto-post? Reddit's API requires per-subreddit OAuth and
 * every sub has different self-promo rules. Posting programmatically
 * is the fastest route to a Reddit-wide shadowban. Humans submit.
 */
export default function RedditAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [drafts, setDrafts] = useState<RedditDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-field copy feedback, keyed "<draftIndex>:<field>".
  const [copied, setCopied] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reddit", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDrafts(data.drafts ?? []);
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [key]);

  async function copyToClipboard(value: string, tag: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch {
      // Silent — browsers without clipboard access are rare for admins
      // and the user can still manually select/copy.
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Reddit Drafts</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Generate Reddit-ready posts with subreddit recommendations.
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
          <Button type="submit" className="w-full" disabled={!key || loading}>
            {loading ? "Loading…" : "Generate drafts"}
          </Button>
        </form>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reddit drafts</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {drafts.length} post
            {drafts.length === 1 ? "" : "s"} ready — pick a subreddit, copy,
            post.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDrafts} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="bg-red-500/5 border-red-500/30 mb-4">
          <CardContent className="p-4 text-sm text-red-400">{error}</CardContent>
        </Card>
      )}

      {/* Markdown-mode reminder. Reddit defaults new accounts to the
          "fancy" rich-text editor, which renders pasted [text](url) as
          literal text. Switch to Markdown Mode in the post composer
          before pasting (or set Markdown as the default editor in
          Reddit Preferences → Feed Settings). */}
      <Card className="bg-blue-500/5 border-blue-500/30 mb-4">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-300 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-200/90 leading-relaxed">
            <p className="font-semibold text-blue-200 mb-1">
              Reddit posts use markdown — switch the editor mode before pasting.
            </p>
            <p>
              In the Reddit post composer, click the <strong>T↓</strong>{" "}
              dropdown (top-right of the body field) and pick{" "}
              <strong>Markdown Mode</strong>. Otherwise{" "}
              <code className="text-[11px] bg-neutral-900/80 px-1 rounded">
                [item](url)
              </code>{" "}
              renders as literal text instead of a link.
            </p>
            <p className="mt-1">
              To make this the default everywhere:{" "}
              <a
                href="https://www.reddit.com/prefs/feed-options/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 hover:text-blue-200 underline inline-flex items-center gap-0.5"
              >
                Reddit Preferences → Feed Settings → &quot;Use Markdown by default&quot;
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        {drafts.map((d, i) => (
          <Card key={d.kind} className="bg-neutral-900/60 border-neutral-800">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-purple-400" />
                  <span className="text-xs uppercase tracking-wider text-neutral-500">
                    {KIND_LABELS[d.kind] ?? d.kind}
                  </span>
                </div>
                {d.link && (
                  <a
                    href={d.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neutral-500 hover:text-white inline-flex items-center gap-1"
                  >
                    Preview source
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                    Title
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(d.title, `${i}:title`)}
                    className="text-[11px] text-neutral-400 hover:text-white inline-flex items-center gap-1"
                  >
                    {copied === `${i}:title` ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <p className="text-white font-medium leading-snug">{d.title}</p>
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                    Body · {d.body.length.toLocaleString()} chars
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(d.body, `${i}:body`)}
                    className="text-[11px] text-neutral-400 hover:text-white inline-flex items-center gap-1"
                  >
                    {copied === `${i}:body` ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy markdown
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs text-neutral-300 bg-neutral-950/60 rounded-lg border border-neutral-800 p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
                  {d.body}
                </pre>
              </div>

              {/* Image URL (for image-post subreddits) */}
              {d.imageUrl && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                      Cover image (paste into the URL field of an image post)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(d.imageUrl!, `${i}:image`)
                      }
                      className="text-[11px] text-neutral-400 hover:text-white inline-flex items-center gap-1"
                    >
                      {copied === `${i}:image` ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />{" "}
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy URL
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.imageUrl}
                      alt=""
                      className="w-24 h-14 rounded border border-neutral-800 object-cover bg-neutral-950"
                    />
                    <code className="text-xs text-neutral-500 truncate flex-1">
                      {d.imageUrl}
                    </code>
                  </div>
                </div>
              )}

              {/* Subreddit recommendations */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                  Where to post
                </p>
                <div className="space-y-2">
                  {d.subreddits.map((s) => (
                    <a
                      key={s.name}
                      href={`https://www.reddit.com/${s.name}/submit?title=${encodeURIComponent(d.title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-neutral-800 bg-neutral-950/40 hover:border-purple-500/40 transition-colors p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white font-medium mb-0.5">
                            {s.name}
                            <ExternalLink className="inline h-3 w-3 ml-1 text-neutral-500" />
                          </p>
                          <p className="text-xs text-neutral-400 leading-relaxed">
                            {s.reason}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0 ${RISK_STYLES[s.risk]}`}
                        >
                          {s.risk === "high" && (
                            <AlertTriangle className="h-2.5 w-2.5" />
                          )}
                          {s.risk} risk
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {drafts.length === 0 && !loading && (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-neutral-500">
              No drafts available — market data may not be populated yet.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200/80 leading-relaxed">
        <p className="font-semibold mb-1 text-amber-200">Posting checklist</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>
            Read each subreddit's self-promo rule before you submit. "Low
            risk" still means "follow the rule".
          </li>
          <li>
            Pick a different subreddit each week for the same kind of post —
            cross-posting identical content gets flagged fast.
          </li>
          <li>
            Engage in the comments for at least an hour after posting. A
            dead-comments post gets removed by reflex on most subs.
          </li>
        </ul>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";

const MAX_BODY = 1000;

interface CommentUser {
  id: string;
  steamId: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface ThreadComment {
  id: string;
  body: string;
  // Serialized to ISO string when passed from the server component, since
  // Date instances cross the server/client boundary as strings under the
  // App Router's serialization rules.
  createdAt: string;
  user: CommentUser;
}

interface CommentsThreadProps {
  listingId: string;
  initialComments: ThreadComment[];
  currentUserId: string | null;
}

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

export function CommentsThread({
  listingId,
  initialComments,
  currentUserId,
}: CommentsThreadProps) {
  const { user, login, loading } = useAuth();
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Trust the SSR-rendered currentUserId on first paint to avoid an
  // auth-state flash, but defer to the client-side AuthContext once it
  // resolves (e.g. after a fresh login the cookie is set but SSR didn't
  // see it).
  const effectiveUserId = user?.id ?? currentUserId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/trade/${listingId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      startTransition(() => {
        setComments((prev) => [
          ...prev,
          {
            ...data.comment,
            createdAt:
              typeof data.comment.createdAt === "string"
                ? data.comment.createdAt
                : new Date(data.comment.createdAt).toISOString(),
          },
        ]);
      });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    try {
      const res = await fetch(
        `/api/trade/${listingId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-4 w-4 text-purple-400" />
        <h2 className="text-sm font-semibold text-white">
          Comments
          <span className="text-neutral-500 font-normal ml-2">
            {comments.length}
          </span>
        </h2>
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-neutral-500 mb-4">
          No comments yet. Drop your Discord/Steam handle to reach out.
        </p>
      ) : (
        <ul className="space-y-3 mb-4">
          {comments.map((c) => {
            const canDelete = effectiveUserId && c.user.id === effectiveUserId;
            return (
              <li
                key={c.id}
                className="flex gap-3 rounded-lg bg-neutral-950/40 border border-neutral-800 p-3"
              >
                {c.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full border border-neutral-700 shrink-0"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-neutral-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <a
                      href={`https://steamcommunity.com/profiles/${c.user.steamId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-white hover:text-purple-300 inline-flex items-center gap-1"
                    >
                      {c.user.username ?? "Anonymous"}
                      <ExternalLink className="h-2.5 w-2.5 text-neutral-500" />
                    </a>
                    <span className="text-[10px] text-neutral-500">
                      {formatRelative(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                    {c.body}
                  </p>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="mt-1.5 text-[11px] text-neutral-600 hover:text-red-400 inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Compose */}
      {loading ? (
        <div className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-center text-xs text-neutral-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
          Loading…
        </div>
      ) : effectiveUserId ? (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
            placeholder="Add a comment — e.g. +rep, hit me on Discord: handle#1234"
            rows={3}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-purple-500/50 resize-y min-h-[64px]"
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-neutral-600">
              {draft.length} / {MAX_BODY}
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || draft.trim().length === 0}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : null}
              Post comment
            </Button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      ) : (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-neutral-400">
            Sign in with Steam to comment.
          </p>
          <Button
            size="sm"
            onClick={() => login()}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Sign in with Steam
          </Button>
        </div>
      )}
    </section>
  );
}

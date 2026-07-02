"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Loader2, AlertCircle } from "lucide-react";
import { Stars } from "@/components/market/stars";

interface ExistingReview {
  stars: number;
  comment: string | null;
}

/**
 * Buyer's "Rate this seller" block, shown on the order page once the order is RELEASED. If the buyer
 * already reviewed, renders their review read-only; otherwise a one-time star + optional comment form
 * that POSTs to /api/market/orders/[id]/review and refreshes.
 */
export function RateSeller({
  orderId,
  existing,
}: {
  orderId: string;
  existing: ExistingReview | null;
}) {
  const router = useRouter();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="text-sm font-semibold text-tx">Your review</h2>
        <div className="mt-2 flex items-center gap-2">
          <Stars value={existing.stars} size={18} />
          <span className="text-sm text-mut">{existing.stars}/5</span>
        </div>
        {existing.comment ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-mut">{existing.comment}</p>
        ) : null}
      </div>
    );
  }

  async function submit() {
    if (stars < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/orders/${orderId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars, comment: comment.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || stars;

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-sm font-semibold text-tx">Rate this seller</h2>
      <p className="mt-1 text-xs text-mut">
        Your rating is public on the seller&apos;s profile. You can only review once.
      </p>
      <div className="mt-3 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setStars(n)}
            className="p-0.5"
          >
            <Star
              className={n <= shown ? "text-accent" : "text-line"}
              style={{ width: 26, height: 26 }}
              fill={n <= shown ? "currentColor" : "none"}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)"
        rows={3}
        maxLength={500}
        className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || stars < 1}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
          Submit review
        </button>
        {error ? (
          <span className="flex items-center gap-1.5 text-sm text-down">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

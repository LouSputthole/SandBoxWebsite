"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

/**
 * Small per-party visibility switch shown on the order page for the viewing party. Reflects their
 * current flag (buyerPublic or sellerPublic, resolved server-side) and updates optimistically —
 * flipping the switch immediately, then reconciling / reverting on the API response. Amounts and
 * on-chain proof are public regardless; this only controls whether the party's Steam identity shows
 * on the public ledger.
 */
export function PrivacyToggle({ orderId, initialPublic }: { orderId: string; initialPublic: boolean }) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !isPublic;
    setIsPublic(next); // optimistic
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/orders/${orderId}/privacy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ public: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
    } catch (err) {
      setIsPublic(!next); // revert
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-tx">
            {isPublic ? <Eye className="h-4 w-4 text-accent" /> : <EyeOff className="h-4 w-4 text-mut" />}
            Show my Steam identity on the public ledger
          </div>
          <p className="mt-1 text-xs text-mut">
            {isPublic
              ? "Your Steam name and profile appear next to this trade on the public ledger. The amount and on-chain proof are always public."
              : "You appear as “Anonymous” on the public ledger. The amount and on-chain proof are always public."}
          </p>
          {error ? <p className="mt-1 text-xs text-down">{error}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label="Show my Steam identity on the public ledger"
          onClick={toggle}
          disabled={busy}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            isPublic ? "bg-accent" : "bg-bg2 border border-line"
          }`}
        >
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white transition-transform ${
              isPublic ? "translate-x-5" : "translate-x-0.5"
            }`}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin text-mut" /> : null}
          </span>
        </button>
      </div>
    </div>
  );
}

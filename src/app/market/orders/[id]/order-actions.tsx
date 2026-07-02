"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Flag, Loader2, AlertCircle } from "lucide-react";

const LIVE_STATES = ["FUNDED", "PROTECTION_HOLD"];

export function OrderActions({
  orderId,
  state,
  isSeller,
}: {
  orderId: string;
  state: string;
  isSeller: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sent" | "dispute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [sentOpen, setSentOpen] = useState(false);
  const [tradeOfferInput, setTradeOfferInput] = useState("");
  // Accept a raw id or a pasted URL like https://steamcommunity.com/tradeoffer/8156301868/
  const tradeOfferId = tradeOfferInput.match(/\d{5,20}/)?.[0] ?? null;

  async function post(path: string, body?: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
  }

  async function markSent() {
    if (!tradeOfferId) return;
    setBusy("sent");
    setError(null);
    try {
      // The trade offer id is REQUIRED — it's how the oracle verifies delivery (and how the seller
      // gets paid). Without it the order would refund the buyer at the SLA deadline.
      await post(`/api/market/orders/${orderId}/sent`, { tradeOfferId });
      setSentOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function submitDispute() {
    if (!reason.trim()) return;
    setBusy("dispute");
    setError(null);
    try {
      await post(`/api/market/orders/${orderId}/dispute`, { reason: reason.trim() });
      setDisputing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const canAct = LIVE_STATES.includes(state);
  if (!canAct) return null;

  return (
    <div className="space-y-3">
      {isSeller && state === "FUNDED" ? (
        !sentOpen ? (
          <button
            onClick={() => setSentOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Send className="h-4 w-4" />
            I&apos;ve sent the Steam trade
          </button>
        ) : (
          <div className="rounded-xl border border-line bg-panel p-4">
            <label className="mb-1 block text-sm font-medium text-tx">Trade offer ID or URL</label>
            <p className="mb-2 text-xs text-mut">
              Paste the trade offer link (steamcommunity.com/tradeoffer/…) or its ID — it&apos;s how we
              verify delivery and release your payout.
            </p>
            <input
              value={tradeOfferInput}
              onChange={(e) => setTradeOfferInput(e.target.value)}
              placeholder="https://steamcommunity.com/tradeoffer/8156301868/"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={markSent}
                disabled={busy !== null || !tradeOfferId}
                className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy === "sent" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirm sent
              </button>
              <button
                onClick={() => setSentOpen(false)}
                className="rounded-lg border border-line px-3 py-2 text-sm text-mut hover:text-tx"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      ) : null}

      {!disputing ? (
        <button
          onClick={() => setDisputing(true)}
          className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-mut hover:border-down/60 hover:text-down"
        >
          <Flag className="h-4 w-4" /> Open a dispute
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-panel p-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What went wrong?"
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitDispute}
              disabled={busy !== null || !reason.trim()}
              className="flex items-center gap-2 rounded-lg bg-down px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy === "dispute" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit dispute
            </button>
            <button
              onClick={() => setDisputing(false)}
              className="rounded-lg border border-line px-3 py-2 text-sm text-mut hover:text-tx"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="flex items-start gap-1.5 text-sm text-down">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      ) : null}
    </div>
  );
}

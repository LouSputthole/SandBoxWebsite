"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Bitcoin, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BuyWithCryptoButtonProps {
  listingId: string;
  /** Server-rendered hint of whether the feature is on. When false the
   *  button still renders disabled with explainer text — surfaces "we
   *  do escrow in private beta" without hiding the affordance. */
  enabled: boolean;
  /** Server-rendered total price (USD) so the button can show it
   *  without a round trip. */
  priceUsd: number | null;
  /** Server-rendered cap so we can preview the "trade exceeds cap"
   *  state before the user clicks. */
  maxUsd: number;
  /** True if the viewer is the listing owner — buying your own listing
   *  is rejected server-side; we hide the button for them. */
  isSelf: boolean;
}

export function BuyWithCryptoButton({
  listingId,
  enabled,
  priceUsd,
  maxUsd,
  isSelf,
}: BuyWithCryptoButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isSelf) return null;

  const overCap = priceUsd != null && priceUsd > maxUsd;
  const noPrice = priceUsd == null;

  async function startBuy() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/escrow/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // Redirect the buyer to Coinbase Commerce's hosted checkout. They
      // bounce back to /trade/escrow/[id] when done.
      window.location.href = data.hostedUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  if (!enabled) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-500 leading-relaxed">
        Crypto escrow is in private beta. Click &quot;Open trade on Steam&quot;
        above to deal directly with the seller.
      </div>
    );
  }

  if (noPrice || overCap) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-relaxed inline-flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          {noPrice
            ? "This listing isn't priced through escrow yet — deal direct via Steam."
            : `Trade total exceeds the current escrow cap of $${maxUsd}. Deal direct via Steam.`}
        </span>
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        onClick={startBuy}
        disabled={submitting}
        className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bitcoin className="h-4 w-4" />
        )}
        Buy with crypto · $
        {priceUsd != null ? priceUsd.toFixed(2) : "—"}
      </Button>
      {error && (
        <p className="text-xs text-red-400 mt-2 max-w-xs leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}

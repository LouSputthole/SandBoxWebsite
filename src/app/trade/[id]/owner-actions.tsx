"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Owner-only inline actions on a listing detail page. Mark completed (the
 * trade actually happened) or cancel (pull the listing). Both calls hit
 * PATCH /api/trade/[id] which enforces auth + ownership server-side.
 */
export function OwnerActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"completed" | "cancelled" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: "completed" | "cancelled") {
    if (next === "cancelled" && !confirm("Cancel this listing?")) return;
    setBusy(next);
    setError(null);
    try {
      const res = await fetch(`/api/trade/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setStatus("completed")}
        disabled={busy !== null}
        className="gap-1.5 border-emerald-700/50 text-emerald-300 hover:bg-emerald-500/10"
      >
        {busy === "completed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Mark completed
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setStatus("cancelled")}
        disabled={busy !== null}
        className="gap-1.5 border-neutral-700 text-neutral-400 hover:text-red-300 hover:border-red-500/40"
      >
        {busy === "cancelled" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        Cancel
      </Button>
      {error && <span className="text-xs text-red-400 ml-2">{error}</span>}
    </div>
  );
}

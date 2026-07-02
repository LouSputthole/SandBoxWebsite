"use client";

import { useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  ShieldOff,
  Link2Off,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const CONFIRM_WORD = "DELETE";

export function DeleteAccountPanel() {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const armed = confirm.trim().toUpperCase() === CONFIRM_WORD;

  async function submit() {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // 409 = escrow-safety guard (settle your live orders/listings first). Surface the message.
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setDone(true);
      // Signed out already (sessions were deleted). Send them home with a deleted state.
      setTimeout(() => {
        window.location.href = "/?account=deleted";
      }, 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="bg-neutral-900/60 border-emerald-500/30">
        <CardContent className="p-6 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-300 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-white">Your account has been deleted.</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Your Steam link, wallet link, seller API key, watchlist, alerts and trade posts are
              gone. Taking you home…
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-neutral-900/60 border-red-500/30">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldOff className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Delete account</h2>
        </div>

        <p className="text-sm text-neutral-300">
          This permanently removes the personal data we control. It can&apos;t be undone. Read what
          happens before you confirm.
        </p>

        {/* What gets deleted */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InfoBlock
            tone="deleted"
            icon={<Link2Off className="h-4 w-4" />}
            title="Deleted"
          >
            Your Steam link, wallet link, seller Steam API key, watchlist, price alerts, in-app
            notifications, login history, and your trade-board posts.
          </InfoBlock>
          <InfoBlock
            tone="kept"
            icon={<KeyRound className="h-4 w-4" />}
            title="Kept, anonymized"
          >
            Completed marketplace trades are retained for accounting, but your identity is removed
            from them — you show as an anonymized, deleted user.
          </InfoBlock>
          <InfoBlock
            tone="chain"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Can't be deleted"
          >
            On-chain transactions are permanent and public. They only ever contain wallet addresses
            — never your name or Steam identity.
          </InfoBlock>
        </div>

        <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
          <label htmlFor="confirm-delete" className="block text-xs text-neutral-400">
            To confirm, type <span className="font-mono font-semibold text-red-300">{CONFIRM_WORD}</span> below.
          </label>
          <input
            id="confirm-delete"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_WORD}
            className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/40"
            aria-invalid={confirm.length > 0 && !armed}
          />

          <Button
            variant="destructive"
            className="mt-3 gap-2 disabled:opacity-40"
            disabled={!armed || busy}
            onClick={submit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Permanently delete my account
          </Button>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5 shrink-0" />
              <p className="text-xs text-red-200">{error}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoBlock({
  tone,
  icon,
  title,
  children,
}: {
  tone: "deleted" | "kept" | "chain";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "deleted"
      ? "text-red-300 border-red-500/25"
      : tone === "kept"
        ? "text-amber-300 border-amber-500/25"
        : "text-neutral-300 border-neutral-700";
  return (
    <div className={`rounded-lg border ${toneClass} bg-neutral-950/40 p-3`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
        {icon}
        <span>{title}</span>
      </div>
      <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">{children}</p>
    </div>
  );
}

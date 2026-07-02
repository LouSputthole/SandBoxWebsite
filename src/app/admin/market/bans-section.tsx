"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Loader2, AlertTriangle, RotateCcw, ShieldX } from "lucide-react";
import type { AdminBan, BansResponse } from "./types";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
}

function truncate(v: string | null): string {
  if (!v) return "—";
  return v.length <= 16 ? v : `${v.slice(0, 6)}…${v.slice(-6)}`;
}

/**
 * Marketplace bans panel: the active ban list (steamId / wallet / reason / who / date + a Lift
 * button) and a compact form to ban a Steam id and/or a wallet with a reason. Reuses the admin
 * key-entry + fetch pattern (Bearer key) and Arcade tokens. `reloadKey` bumps trigger a re-fetch so a
 * quick-ban from the order detail refreshes this list too.
 */
export function BansSection({ apiKey, reloadKey = 0 }: { apiKey: string; reloadKey?: number }) {
  const [bans, setBans] = useState<AdminBan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [steamId, setSteamId] = useState("");
  const [wallet, setWallet] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyLift, setBusyLift] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/market/ban`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setBans(((await res.json()) as BansResponse).bans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bans");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const submitBan = useCallback(async () => {
    if (!steamId.trim() && !wallet.trim()) {
      setFormError("Enter a Steam id and/or a wallet address.");
      return;
    }
    if (!reason.trim()) {
      setFormError("A reason is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/admin/market/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          action: "ban",
          steamId: steamId.trim() || undefined,
          walletAddress: wallet.trim() || undefined,
          reason: reason.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setBans((body as BansResponse).bans);
      setSteamId("");
      setWallet("");
      setReason("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Ban failed");
    } finally {
      setSubmitting(false);
    }
  }, [apiKey, steamId, wallet, reason]);

  const lift = useCallback(
    async (id: string) => {
      if (!confirm("Lift this ban? The identifier will be able to use the marketplace again.")) return;
      setBusyLift(id);
      try {
        const res = await fetch(`/api/admin/market/ban`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ action: "lift", id }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setBans((body as BansResponse).bans);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lift failed");
      } finally {
        setBusyLift(null);
      }
    },
    [apiKey],
  );

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-tx">
          <ShieldX className="h-4 w-4 text-down" /> Bans
          {bans ? <span className="text-faint">({bans.length} active)</span> : null}
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-mut hover:text-tx disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Ban form */}
        <div className="rounded-lg border border-line bg-bg2 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Ban an identifier</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="SteamID64 (17 digits)"
              className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
            />
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="Solana wallet (base58)"
              className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
            />
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required — admin-only, never shown to the user)"
            rows={2}
            maxLength={500}
            className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
          />
          {formError ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-down">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {formError}
            </p>
          ) : null}
          <button
            onClick={submitBan}
            disabled={submitting}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-down px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Ban
          </button>
        </div>

        {/* Active bans list */}
        {error ? (
          <p className="flex items-start gap-1.5 text-xs text-down">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        ) : null}

        {bans && bans.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">No active bans.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                  <th className="px-2 py-2 text-left font-medium">Steam id</th>
                  <th className="px-2 py-2 text-left font-medium">Wallet</th>
                  <th className="px-2 py-2 text-left font-medium">Reason</th>
                  <th className="px-2 py-2 text-left font-medium">By</th>
                  <th className="px-2 py-2 text-right font-medium">When</th>
                  <th className="px-2 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {bans?.map((b) => (
                  <tr key={b.id} className="border-b border-line/50 last:border-0">
                    <td className="px-2 py-2 font-mono text-xs text-tx" title={b.steamId ?? undefined}>
                      {truncate(b.steamId)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-mut" title={b.walletAddress ?? undefined}>
                      {truncate(b.walletAddress)}
                    </td>
                    <td className="max-w-[14rem] truncate px-2 py-2 text-xs text-mut" title={b.reason}>
                      {b.reason}
                    </td>
                    <td className="px-2 py-2 text-xs text-faint">{b.bannedByKeyType}</td>
                    <td className="px-2 py-2 text-right text-xs text-faint">{fmtDate(b.createdAt)}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => lift(b.id)}
                        disabled={busyLift === b.id}
                        className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-mut hover:border-accent hover:text-tx disabled:opacity-50"
                      >
                        {busyLift === b.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Lift
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

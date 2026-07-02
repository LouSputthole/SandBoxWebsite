"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Snowflake,
  RotateCw,
  ArrowUpCircle,
  ArrowDownCircle,
  Ban,
} from "lucide-react";
import { explorerAddressUrl } from "@/lib/market/explorer";
import type { AdminOrder, OrderDetailResponse } from "./types";
import { STATE_COLOR } from "./types";

function fmt(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

function truncate(addr: string | null): string {
  if (!addr) return "—";
  return addr.length <= 12 ? addr : `${addr.slice(0, 5)}…${addr.slice(-5)}`;
}

function Copyable({ value, display }: { value: string | null; display?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-faint">—</span>;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      title={value}
      className="inline-flex items-center gap-1 font-mono text-xs text-tx hover:text-accent"
    >
      {display ?? truncate(value)}
      {copied ? <Check className="h-3 w-3 text-up" /> : <Copy className="h-3 w-3 text-faint" />}
    </button>
  );
}

const LIVE = new Set(["FUNDED", "PROTECTION_HOLD"]);

export function OrderDetail({
  orderId,
  apiKey,
  onClose,
  onChanged,
  onBanned,
}: {
  orderId: string;
  apiKey: string;
  onClose: () => void;
  onChanged: () => void;
  /** Called after a party is banned from this panel — lets the parent refresh its Bans list. */
  onBanned?: () => void;
}) {
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [banBusy, setBanBusy] = useState<"buyer" | "seller" | null>(null);
  const [banFeedback, setBanFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/market/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData((await res.json()) as OrderDetailResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orderId, apiKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = data?.order;

  const runAction = useCallback(
    async (action: "freeze" | "resolve_release" | "resolve_refund" | "tick", confirmMsg: string) => {
      if (action === "freeze" && !reason.trim()) {
        setActionError("A reason is required to freeze an order.");
        return;
      }
      if (!confirm(confirmMsg)) return;
      setBusy(action);
      setActionError(null);
      try {
        const res = await fetch(`/api/admin/market/orders/${orderId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ action, reason: reason.trim() || undefined }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setReason("");
        await load();
        onChanged();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [orderId, apiKey, reason, load, onChanged],
  );

  // Quick-ban a party straight from the order: prefills their Steam id + wallet and links the ban to
  // this order (orderId). Blocks BOTH identifiers. The reason is collected via a prompt.
  const banParty = useCallback(
    async (party: "buyer" | "seller") => {
      if (!order) return;
      const p = party === "buyer" ? order.buyer : order.seller;
      const who = p.username ?? p.steamId;
      const reasonText = window.prompt(
        `Ban the ${party} (${who}) from the marketplace?\nThis blocks their Steam id AND wallet. Enter a reason:`,
      );
      if (reasonText == null) return; // cancelled
      if (!reasonText.trim()) {
        setBanFeedback("A reason is required to ban.");
        return;
      }
      setBanBusy(party);
      setBanFeedback(null);
      try {
        const res = await fetch(`/api/admin/market/ban`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            action: "ban",
            steamId: p.steamId || undefined,
            walletAddress: p.wallet || undefined,
            reason: reasonText.trim(),
            orderId,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setBanFeedback(`Banned ${party} (${who}).`);
        onBanned?.();
      } catch (err) {
        setBanFeedback(err instanceof Error ? err.message : "Ban failed");
      } finally {
        setBanBusy(null);
      }
    },
    [order, apiKey, orderId, onBanned],
  );

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-tx">
            {order?.listing.item.name ?? "Order"}
          </p>
          <p className="font-mono text-xs text-faint">{orderId}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-mut hover:bg-bg2 hover:text-tx">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-mut">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-6 text-sm text-down">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : order && data ? (
        <div className="space-y-5 p-4">
          <ChainBanner data={data} />

          {/* Money */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Gross" value={`$${order.priceUsdcFormatted}`} />
            <Stat label="Seller gets" value={`$${order.sellerAmountFormatted}`} />
            <Stat label={`Fee (${order.feeBps} bps)`} value={`$${order.feeAmountFormatted}`} accent />
          </div>

          {/* State + parties */}
          <div className="space-y-2 text-sm">
            <Row label="State">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
                  STATE_COLOR[order.state] ?? "text-mut border-line"
                }`}
              >
                {order.state}
              </span>
            </Row>
            <Row label="Buyer">
              <span className="text-tx">{order.buyer.username ?? order.buyer.steamId}</span>{" "}
              <Copyable value={order.buyer.wallet} />
            </Row>
            <Row label="Seller">
              <span className="text-tx">{order.seller.username ?? order.seller.steamId}</span>{" "}
              <Copyable value={order.seller.wallet} />
            </Row>
            <Row label="Escrow PDA">
              {order.escrowPda ? (
                <span className="inline-flex items-center gap-2">
                  <Copyable value={order.escrowPda} />
                  <a
                    href={explorerAddressUrl(order.escrowPda)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-accent hover:underline"
                  >
                    explorer <ExternalLink className="h-3 w-3" />
                  </a>
                </span>
              ) : (
                <span className="text-faint">not funded</span>
              )}
            </Row>
            {order.disputeReason ? (
              <Row label="Dispute">
                <span className="text-down">{order.disputeReason}</span>
              </Row>
            ) : null}
          </div>

          {/* Lifecycle timeline */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Lifecycle</p>
            <ul className="space-y-1.5 text-xs">
              {timeline(order).map((t) => (
                <li key={t.label} className="flex items-center justify-between gap-3">
                  <span className={t.at ? "text-tx" : "text-faint"}>{t.label}</span>
                  <span className="font-mono text-faint">{t.at ?? "—"}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Trade attempts */}
          {order.tradeAttempts.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
                Trade attempts ({order.tradeAttempts.length})
              </p>
              <div className="space-y-2">
                {order.tradeAttempts.map((t) => (
                  <div key={t.id} className="rounded-lg border border-line bg-bg2 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-tx">
                        {t.status}
                        {t.tradeOfferId ? (
                          <span className="ml-2 font-mono text-faint">offer {t.tradeOfferId}</span>
                        ) : null}
                      </span>
                      <span className="font-mono text-faint">{fmt(t.createdAt)}</span>
                    </div>
                    {t.evidence != null ? (
                      <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded border border-line bg-bg p-2 font-mono text-[11px] leading-relaxed text-mut">
                        {JSON.stringify(t.evidence, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Actions */}
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Operator actions</p>
            {actionError ? (
              <p className="mb-2 flex items-start gap-1.5 text-xs text-down">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {actionError}
              </p>
            ) : null}

            {LIVE.has(order.state) ? (
              <div className="mb-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required to freeze)"
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {LIVE.has(order.state) ? (
                <>
                  <ActionButton
                    busy={busy === "freeze"}
                    disabled={busy != null}
                    icon={<Snowflake className="h-4 w-4" />}
                    label="Freeze (dispute)"
                    onClick={() =>
                      runAction("freeze", `Freeze order ${order.id} ($${order.priceUsdcFormatted}) and mark it DISPUTED?`)
                    }
                  />
                  <ActionButton
                    busy={busy === "tick"}
                    disabled={busy != null}
                    icon={<RotateCw className="h-4 w-4" />}
                    label="Force oracle tick"
                    onClick={() =>
                      runAction(
                        "tick",
                        `Force an oracle tick on order ${order.id} ($${order.priceUsdcFormatted})? This may advance, release, refund, or dispute it.`,
                      )
                    }
                  />
                </>
              ) : null}

              {order.state === "DISPUTED" ? (
                <>
                  <ActionButton
                    tone="up"
                    busy={busy === "resolve_release"}
                    disabled={busy != null}
                    icon={<ArrowUpCircle className="h-4 w-4" />}
                    label="Resolve → Release"
                    onClick={() =>
                      runAction(
                        "resolve_release",
                        `Resolve order ${order.id} in the SELLER's favor — release $${order.sellerAmountFormatted} (fee $${order.feeAmountFormatted})?`,
                      )
                    }
                  />
                  <ActionButton
                    tone="down"
                    busy={busy === "resolve_refund"}
                    disabled={busy != null}
                    icon={<ArrowDownCircle className="h-4 w-4" />}
                    label="Resolve → Refund"
                    onClick={() =>
                      runAction(
                        "resolve_refund",
                        `Resolve order ${order.id} in the BUYER's favor — refund $${order.priceUsdcFormatted}?`,
                      )
                    }
                  />
                </>
              ) : null}

              {!LIVE.has(order.state) && order.state !== "DISPUTED" ? (
                <p className="text-xs text-faint">No operator actions for a {order.state} order.</p>
              ) : null}
            </div>
          </div>

          {/* Quick-ban a party (prefilled from this order — blocks their Steam id + wallet). */}
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Ban a party</p>
            {banFeedback ? <p className="mb-2 text-xs text-mut">{banFeedback}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => banParty("buyer")}
                disabled={banBusy != null}
                className="inline-flex items-center gap-2 rounded-lg border border-down/50 px-3 py-2 text-sm font-semibold text-down hover:bg-down/10 disabled:opacity-50"
              >
                {banBusy === "buyer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Ban buyer
              </button>
              <button
                type="button"
                onClick={() => banParty("seller")}
                disabled={banBusy != null}
                className="inline-flex items-center gap-2 rounded-lg border border-down/50 px-3 py-2 text-sm font-semibold text-down hover:bg-down/10 disabled:opacity-50"
              >
                {banBusy === "seller" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Ban seller
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChainBanner({ data }: { data: OrderDetailResponse }) {
  if (data.chainError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-down/40 bg-down/10 p-3 text-xs text-down">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">On-chain read failed</p>
          <p className="text-down/90">{data.chainError}</p>
        </div>
      </div>
    );
  }
  if (data.chainMismatch && data.chain) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-down/40 bg-down/10 p-3 text-xs text-down">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Chain / DB mismatch</p>
          <p className="text-down/90">
            DB says <b>{data.order.state}</b> but on-chain escrow is <b>{data.chain.state}</b>. Reconcile
            before acting.
          </p>
        </div>
      </div>
    );
  }
  if (data.chain) {
    return (
      <div className="rounded-lg border border-up/30 bg-up/5 p-3 text-xs text-mut">
        On-chain escrow in sync: <span className="font-semibold text-up">{data.chain.state}</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-bg2 p-3 text-xs text-faint">
      No on-chain escrow exists yet for this order.
    </div>
  );
}

function timeline(o: AdminOrder): { label: string; at: string | null }[] {
  return [
    { label: "Created", at: fmt(o.createdAt) },
    { label: "Funded (escrowed)", at: fmt(o.fundedAt) },
    { label: "Seller sent trade", at: fmt(o.sellerSentAt) },
    { label: "Delivered", at: fmt(o.deliveredAt) },
    { label: "Protection started", at: fmt(o.protectionStartedAt) },
    { label: "Protection until", at: fmt(o.protectionUntil) },
    { label: "Released", at: fmt(o.releasedAt) },
    { label: "Refunded", at: fmt(o.refundedAt) },
    { label: "Delivery deadline", at: fmt(o.deliveryDeadline) },
  ];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-mut">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-bg2 p-3">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent ? "text-accent" : "text-tx"}`}>{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  busy,
  disabled,
  tone = "neutral",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  tone?: "neutral" | "up" | "down";
}) {
  const toneCls =
    tone === "up"
      ? "bg-up text-black hover:opacity-90"
      : tone === "down"
        ? "bg-down text-white hover:opacity-90"
        : "border border-line text-tx hover:border-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${toneCls}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

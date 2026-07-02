"use client";

import { useState } from "react";
import Link from "next/link";
import { Transaction } from "@solana/web3.js";
import { Wallet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getPhantom } from "../_components/phantom";

type Status = "idle" | "connecting" | "buying" | "signing" | "confirming" | "done" | "error";

/** Decode base64 → bytes in the browser (no Node Buffer). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Encode bytes → base64 in the browser (no Node Buffer). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const BUSY_STATUSES: Status[] = ["buying", "signing", "confirming"];
const BUSY_LABEL: Record<string, string> = {
  buying: "Creating order…",
  signing: "Approve in your wallet…",
  confirming: "Confirming payment…",
};

export function BuyPanel({ listingId, priceUsd, listingUrl }: { listingId: string; priceUsd: number; listingUrl: string }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function connect() {
    const p = getPhantom();
    if (!p) {
      setMessage("Phantom wallet not found — install it at phantom.app to buy.");
      setStatus("error");
      return;
    }
    setStatus("connecting");
    setMessage(null);
    try {
      const { publicKey } = await p.connect();
      const address = publicKey.toString();
      const res = await fetch("/api/market/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (res.status === 401) {
        setNeedsLogin(true);
        setStatus("error");
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not link wallet");
      setWallet(address);
      setStatus("idle");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Wallet connection failed");
      setStatus("error");
    }
  }

  /** Sign an open_escrow tx in Phantom. Returns the signed tx base64, or null if the buyer rejects. */
  async function signOpenTx(txBase64: string): Promise<string | null> {
    try {
      const p = getPhantom();
      if (!p) throw new Error("Phantom wallet not found");
      const tx = Transaction.from(base64ToBytes(txBase64));
      const signed = await p.signTransaction(tx);
      return bytesToBase64(signed.serialize());
    } catch {
      return null;
    }
  }

  /**
   * Buyer rejected the wallet signature — try to cancel, honoring the DELETE contract instead of
   * assuming success: { cancelled: true } → really cancelled; { cancelled: false, order } → the
   * funding actually landed (the purchase went through); 409/other → the order is confirming or has
   * advanced and can no longer be cancelled — point the buyer at the order page rather than falsely
   * claiming the item is still available.
   */
  async function handleSignRejected(id: string) {
    try {
      const res = await fetch(`/api/market/orders/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.cancelled === false && data.order) {
        setStatus("done"); // the escrow had already funded — treat as a completed purchase
        return;
      }
      if (res.ok && data.cancelled === true) {
        setOrderId(null);
        setMessage("Purchase cancelled — the item is still available");
        setStatus("idle");
        return;
      }
      setMessage(data.error ?? "This order can no longer be cancelled — check its status below.");
      setStatus("error");
    } catch {
      setMessage("Couldn't cancel the order — check its status below.");
      setStatus("error");
    }
  }

  /** POST the (optionally signed) funding tx for an order. */
  function postFund(id: string, signedTxBase64: string | null) {
    return fetch(`/api/market/orders/${id}/fund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedTxBase64 ? { signedTxBase64 } : {}),
    });
  }

  async function buy() {
    setStatus("buying");
    setMessage(null);

    // Phase 1 — create the PENDING order and get the open_escrow tx (if any) to sign.
    let id: string;
    let txBase64: string | null;
    try {
      const res = await fetch("/api/market/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setNeedsLogin(true);
        setStatus("error");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Purchase failed");
      id = data.order.id as string;
      txBase64 = (data.openTx?.txBase64 as string | null) ?? null;
      setOrderId(id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Purchase failed");
      setStatus("error");
      return;
    }

    // Phase 2 — buyer signs the deposit in Phantom (skipped on the mock/dev path where txBase64 is
    // null). If they reject or signing fails, cancel via the DELETE contract (handleSignRejected).
    let signedTxBase64: string | null = null;
    if (txBase64) {
      setStatus("signing");
      signedTxBase64 = await signOpenTx(txBase64);
      if (signedTxBase64 === null) {
        await handleSignRejected(id);
        return;
      }
    }

    // Phase 3 — submit the funding. Funds may move here, so on failure we do NOT cancel: the escrow
    // may have landed and the reaper/oracle will reconcile it. Surface the error instead. One special
    // case: 409 { retry, openTx } = the tx's blockhash expired before landing (proven unfunded, the
    // buyer approved in Phantom too late) — re-sign the FRESH tx and resubmit ONCE; a second expiry
    // gives up with a clear message.
    setStatus("confirming");
    try {
      let res = await postFund(id, signedTxBase64);
      let data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.retry === true) {
        const freshTx = (data.openTx?.txBase64 as string | null) ?? null;
        let resigned: string | null = null;
        if (freshTx) {
          setStatus("signing"); // "Approve in your wallet…" again — a fresh signature is needed
          resigned = await signOpenTx(freshTx);
          if (resigned === null) {
            await handleSignRejected(id);
            return;
          }
        }
        setStatus("confirming");
        res = await postFund(id, resigned);
        data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.retry === true) {
          throw new Error("Transaction expired — please try again");
        }
      }

      if (!res.ok) throw new Error(data.error ?? "Could not confirm payment");
      setStatus("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not confirm payment");
      setStatus("error");
    }
  }

  if (status === "done" && orderId) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2 text-up">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Order created — funds in escrow</span>
        </div>
        <p className="mt-2 text-sm text-mut">
          The seller now sends you the skin on Steam. Once it arrives, your payment is held for a
          24-hour dispute window, then released.
        </p>
        <Link
          href={`/market/orders/${orderId}`}
          className="mt-4 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Track your order
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-mut">You pay</span>
        <span className="font-mono text-2xl font-semibold text-tx">${priceUsd.toFixed(2)}</span>
      </div>
      <p className="mt-1 text-xs text-mut">in USDC on Solana · escrow-protected</p>

      {needsLogin ? (
        <Link
          href={`/api/auth/steam?next=${encodeURIComponent(listingUrl)}`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Sign in with Steam to buy
        </Link>
      ) : !wallet ? (
        <button
          onClick={connect}
          disabled={status === "connecting"}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {status === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Connect Phantom
        </button>
      ) : (
        <button
          onClick={buy}
          disabled={BUSY_STATUSES.includes(status)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {BUSY_STATUSES.includes(status) ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {BUSY_LABEL[status]}
            </>
          ) : (
            `Buy — $${priceUsd.toFixed(2)}`
          )}
        </button>
      )}

      {wallet ? (
        <p className="mt-2 truncate text-center text-[11px] text-faint">
          {wallet.slice(0, 4)}…{wallet.slice(-4)}
        </p>
      ) : null}

      {message ? (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-down">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
        </p>
      ) : null}

      {/* A failed confirm is NOT a dead end: the order exists and the oracle reconciles any funds
          that landed — always give the buyer the path to its status page. */}
      {status === "error" && orderId ? (
        <Link
          href={`/market/orders/${orderId}`}
          className="mt-2 inline-flex rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-tx hover:border-accent"
        >
          Check your order status
        </Link>
      ) : null}

      <p className="mt-4 rounded-lg bg-bg/60 px-3 py-2 text-[11px] text-faint">
        Preview — settles on Solana devnet. Mainnet goes live after the program audit + legal review.
      </p>
    </div>
  );
}

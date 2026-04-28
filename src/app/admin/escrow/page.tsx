"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Lock,
  Bitcoin,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Bot as BotIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface Trade {
  id: string;
  state: string;
  priceUsd: number;
  feeUsd: number;
  createdAt: string;
  buyer: { username: string | null; steamId: string };
  seller: { username: string | null; steamId: string };
  botAccount: { label: string } | null;
}

interface DisputedTrade extends Trade {
  dispute: {
    openedBy: string;
    reason: string;
    createdAt: string;
  };
}

interface BotRow {
  id: string;
  steamId: string;
  label: string;
  status: string;
  maxConcurrentTrades: number;
  _count: { trades: number };
  lastHealthcheckAt: string | null;
  lastHealthcheckOk: boolean | null;
}

interface Snapshot {
  open: Trade[];
  recent: Trade[];
  disputes: DisputedTrade[];
  bots: BotRow[];
}

export default function EscrowAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/escrow", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (authed) void fetchData();
  }, [authed, fetchData]);

  async function resolveDispute(
    tradeId: string,
    resolution: string,
    note: string,
  ) {
    if (!confirm(`Apply resolution "${resolution}" to ${tradeId}?`)) return;
    try {
      const res = await fetch("/api/admin/escrow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          tradeId,
          action: "resolve_dispute",
          resolution,
          note,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Escrow admin</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchData();
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            placeholder="Admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!key || loading}>
            Continue
          </Button>
        </form>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bitcoin className="h-5 w-5 text-orange-400" />
            Escrow
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {data?.open.length ?? 0} open · {data?.disputes.length ?? 0} disputed
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Bot fleet */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <BotIcon className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Bot fleet</h2>
          </div>
          {data?.bots.length === 0 ? (
            <p className="text-sm text-neutral-500 italic">
              No bots configured yet. Insert rows in EscrowBotAccount.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-800/60">
              {data?.bots.map((b) => (
                <li
                  key={b.id}
                  className="py-2 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="text-sm">
                    <span className="text-white font-semibold">{b.label}</span>{" "}
                    <span className="text-neutral-500 font-mono text-[10px]">
                      {b.steamId}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 flex items-center gap-3 flex-wrap">
                    <span>
                      load {b._count.trades} / {b.maxConcurrentTrades}
                    </span>
                    <span
                      className={
                        b.status === "active"
                          ? "text-emerald-300"
                          : b.status === "maintenance"
                            ? "text-amber-300"
                            : "text-red-300"
                      }
                    >
                      {b.status}
                    </span>
                    {b.lastHealthcheckAt && (
                      <span className="font-mono">
                        hc {b.lastHealthcheckOk ? "ok" : "fail"} ·{" "}
                        {new Date(b.lastHealthcheckAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Disputes — top of page since they need action */}
      <Card className="bg-red-500/5 border-red-500/30">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-300" />
            <h2 className="text-sm font-semibold text-white">Disputed</h2>
          </div>
          {data?.disputes.length === 0 ? (
            <p className="text-sm text-neutral-500 italic">No open disputes.</p>
          ) : (
            <ul className="space-y-3">
              {data?.disputes.map((t) => (
                <DisputeRow key={t.id} trade={t} onResolve={resolveDispute} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Open trades */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-white mb-3">
            Open trades
          </h2>
          {data?.open.length === 0 ? (
            <p className="text-sm text-neutral-500 italic">No open trades.</p>
          ) : (
            <ul className="divide-y divide-neutral-800/60">
              {data?.open.map((t) => <TradeRow key={t.id} trade={t} />)}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent settled */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-white mb-3">
            Recently settled
          </h2>
          {data?.recent.length === 0 ? (
            <p className="text-sm text-neutral-500 italic">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-800/60">
              {data?.recent.map((t) => <TradeRow key={t.id} trade={t} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const tone =
    trade.state === "completed"
      ? "text-emerald-300"
      : trade.state === "cancelled" || trade.state === "refunded"
        ? "text-neutral-400"
        : "text-purple-300";
  return (
    <li className="py-2 flex items-center justify-between gap-3 flex-wrap text-xs">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`font-semibold ${tone}`}>{trade.state}</span>
        <span className="text-neutral-300 font-mono truncate">
          {trade.id}
        </span>
        <span className="text-neutral-500">
          ${trade.priceUsd.toFixed(2)}
        </span>
      </div>
      <div className="text-neutral-500 flex items-center gap-3">
        <span>{trade.buyer.username ?? "?"} ← {trade.seller.username ?? "?"}</span>
        {trade.botAccount && <span>via {trade.botAccount.label}</span>}
        <span>{new Date(trade.createdAt).toLocaleString()}</span>
      </div>
    </li>
  );
}

function DisputeRow({
  trade,
  onResolve,
}: {
  trade: DisputedTrade;
  onResolve: (id: string, resolution: string, note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <li className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <span className="text-xs font-mono text-white">{trade.id}</span>
        <span className="text-[10px] text-neutral-500">
          opened by {trade.dispute.openedBy} ·{" "}
          {new Date(trade.dispute.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-neutral-300 mb-2">{trade.dispute.reason}</p>
      <p className="text-[11px] text-neutral-500 mb-2">
        ${trade.priceUsd.toFixed(2)} · {trade.buyer.username ?? "?"} ← {trade.seller.username ?? "?"}
      </p>
      <Input
        type="text"
        placeholder="Resolution note (saved to audit)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="text-xs mb-2"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(trade.id, "released_to_buyer", note)}
          className="text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Release to buyer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(trade.id, "refunded_to_buyer", note)}
        >
          Refund buyer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(trade.id, "returned_to_seller", note)}
        >
          Return to seller
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(trade.id, "rejected", note)}
        >
          Reject (retry release)
        </Button>
      </div>
    </li>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Lock,
  Coins,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
  RotateCcw,
  Tag,
} from "lucide-react";
import type { AccountingResponse, AdminOrder, OrdersResponse } from "./types";
import { FILTER_STATES, STATE_COLOR } from "./types";
import { OrderDetail } from "./order-detail";
import { AccountingSection } from "./accounting-section";
import { BansSection } from "./bans-section";

const TAKE = 50;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
}

function age(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

/** The timestamp that matters for an order in its current state (shown in the table). */
function keyStamp(o: AdminOrder): { label: string; at: string | null } {
  switch (o.state) {
    case "PENDING":
      return { label: "created", at: o.createdAt };
    case "FUNDING":
      // Payment confirming on-chain — the interesting time is still when the checkout started.
      return { label: "created", at: o.createdAt };
    case "FUNDED":
      return { label: "funded", at: o.fundedAt };
    case "PROTECTION_HOLD":
      return { label: "payout", at: o.protectionUntil };
    case "DISPUTED":
      return { label: "disputed", at: o.updatedAt };
    case "RELEASED":
      return { label: "released", at: o.releasedAt };
    case "REFUNDED":
      return { label: "refunded", at: o.refundedAt };
    default:
      return { label: "updated", at: o.updatedAt };
  }
}

export default function MarketAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [orders, setOrders] = useState<OrdersResponse | null>(null);
  const [accounting, setAccounting] = useState<AccountingResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [stateFilter, setStateFilter] = useState<string>("all");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bumped when a ban is created from an order's quick-ban, so the Bans panel re-fetches.
  const [banReload, setBanReload] = useState(0);

  const fetchAll = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setAuthError(null);
    try {
      const params = new URLSearchParams({ take: String(TAKE) });
      if (stateFilter !== "all") params.set("state", stateFilter);
      if (query.trim()) params.set("q", query.trim());

      const [ordersRes, acctRes] = await Promise.all([
        fetch(`/api/admin/market/orders?${params}`, { headers: { Authorization: `Bearer ${key}` } }),
        fetch(`/api/admin/market/accounting`, { headers: { Authorization: `Bearer ${key}` } }),
      ]);

      if (ordersRes.status === 401 || acctRes.status === 401) {
        setAuthError("Wrong admin key");
        setAuthed(false);
        return;
      }
      if (!ordersRes.ok) throw new Error(`orders HTTP ${ordersRes.status}`);
      if (!acctRes.ok) throw new Error(`accounting HTTP ${acctRes.status}`);

      setOrders((await ordersRes.json()) as OrdersResponse);
      setAccounting((await acctRes.json()) as AccountingResponse);
      setAuthed(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [key, stateFilter, query]);

  useEffect(() => {
    if (authed) void fetchAll();
  }, [authed, stateFilter, query, fetchAll]);

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="mx-auto mb-6 h-12 w-12 text-line" />
        <h1 className="mb-2 text-xl font-bold text-tx">Marketplace admin</h1>
        <p className="mb-6 text-sm text-mut">Orders, disputes, escrow, and the books.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (key) setAuthed(true);
          }}
          className="space-y-3"
        >
          <input
            type="password"
            placeholder="Admin key (CRON_SECRET or ANALYTICS_KEY)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!key}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Continue
          </button>
        </form>
        {authError && <p className="mt-3 text-sm text-down">{authError}</p>}
      </div>
    );
  }

  const s = accounting?.summary;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-tx">
          <Coins className="h-6 w-6 text-accent" /> Marketplace
        </h1>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-mut hover:text-tx disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Fee revenue" value={s ? `$${s.feeRevenue.usdc}` : "—"} accent />
        <StatCard icon={<Coins className="h-4 w-4" />} label="Released volume" value={s ? `$${s.grossReleasedVolume.usdc}` : "—"} />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="In escrow" value={s ? `$${s.inEscrowFloat.usdc}` : "—"} />
        <StatCard icon={<RotateCcw className="h-4 w-4" />} label="Refunded" value={s ? `$${s.refundedVolume.usdc}` : "—"} />
        <StatCard icon={<Tag className="h-4 w-4" />} label="Active listings" value={orders ? String(orders.activeListings) : "—"} />
      </div>

      {/* Filter tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTER_STATES.map((st) => {
          const count = st === "all" ? orders?.total ?? 0 : orders?.countsByState[st] ?? 0;
          const active = stateFilter === st;
          return (
            <button
              key={st}
              onClick={() => {
                setStateFilter(st);
                setSelectedId(null);
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                active ? "border-accent bg-accent/10 text-accent" : "border-line text-mut hover:text-tx"
              }`}
            >
              {st === "all" ? "All" : st}
              <span className="ml-1.5 text-faint">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(queryInput);
        }}
        className="mb-4 flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search order id, wallet, username, steamId, item…"
            className="w-full rounded-lg border border-line bg-bg py-2 pl-9 pr-3 text-sm text-tx outline-none focus:border-accent"
          />
        </div>
        <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm text-tx hover:border-accent">
          Search
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Orders table */}
        <div className={selectedId ? "lg:col-span-3" : "lg:col-span-5"}>
          <div className="overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                  <th className="px-3 py-2.5 text-left font-medium">Order</th>
                  <th className="px-3 py-2.5 text-left font-medium">Item</th>
                  <th className="px-3 py-2.5 text-right font-medium">Price</th>
                  <th className="px-3 py-2.5 text-left font-medium">Buyer → Seller</th>
                  <th className="px-3 py-2.5 text-left font-medium">State</th>
                  <th className="px-3 py-2.5 text-right font-medium">Age</th>
                  <th className="px-3 py-2.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {orders?.orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-faint">
                      No orders match.
                    </td>
                  </tr>
                ) : (
                  orders?.orders.map((o) => {
                    const ks = keyStamp(o);
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelectedId(o.id)}
                        className={`cursor-pointer border-b border-line/50 last:border-0 hover:bg-bg2 ${
                          selectedId === o.id ? "bg-bg2" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-mut">{o.id.slice(0, 8)}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2.5 text-tx">{o.listing.item.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-tx">${o.priceUsdcFormatted}</td>
                        <td className="max-w-[12rem] truncate px-3 py-2.5 text-xs text-mut">
                          {o.buyer.username ?? o.buyer.steamId} → {o.seller.username ?? o.seller.steamId}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                              STATE_COLOR[o.state] ?? "text-mut border-line"
                            }`}
                          >
                            {o.state}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-faint">{age(o.createdAt)}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-faint" title={ks.label}>
                          {fmtDate(ks.at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {(() => {
            // `total` ignores the state filter (the tabs need all-state counts), so the "of N" here
            // must use the active tab's own count or it overstates what matches the current view.
            const matching =
              stateFilter === "all" ? orders?.total ?? 0 : orders?.countsByState[stateFilter] ?? 0;
            return orders && matching > orders.orders.length ? (
              <p className="mt-2 text-xs text-faint">
                Showing {orders.orders.length} of {matching}. Narrow with a filter or search.
              </p>
            ) : null;
          })()}
        </div>

        {/* Detail panel */}
        {selectedId ? (
          <div className="lg:col-span-2">
            <OrderDetail
              key={selectedId}
              orderId={selectedId}
              apiKey={key}
              onClose={() => setSelectedId(null)}
              onChanged={fetchAll}
              onBanned={() => setBanReload((n) => n + 1)}
            />
          </div>
        ) : null}
      </div>

      {/* Bans */}
      <div className="mt-6">
        <BansSection apiKey={key} reloadKey={banReload} />
      </div>

      {/* Accounting */}
      <div className="mt-6">
        <AccountingSection data={accounting} apiKey={key} />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center gap-1.5 text-faint">
        {icon}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-bold ${accent ? "text-accent" : "text-tx"}`}>{value}</p>
    </div>
  );
}

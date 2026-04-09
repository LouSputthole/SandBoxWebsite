"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  Package,
  DollarSign,
  AlertCircle,
  ExternalLink,
  Backpack,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ItemImage } from "@/components/items/item-image";
import { formatPrice } from "@/lib/utils";

interface InventoryItem {
  name: string;
  slug: string | null;
  type: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  marketable: boolean;
}

interface InventoryResult {
  steamid64: string;
  totalItems: number;
  uniqueItems: number;
  totalValue: number;
  items: InventoryItem[];
}

export default function InventoryPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/inventory?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load inventory");
        return;
      }

      setResult(data);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-4">
          <Backpack className="h-4 w-4 text-blue-400" />
          <span className="text-sm text-blue-300">Inventory Value Checker</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">
          Check Your S&box Inventory Value
        </h1>
        <p className="text-neutral-400 max-w-xl mx-auto">
          Paste your Steam profile URL below to see the total value of your S&box inventory.
          Your inventory must be set to public.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-10">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="https://steamcommunity.com/id/yourname or /profiles/76561198..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="pl-9 h-12 text-base"
              disabled={loading}
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="h-12 px-6 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Check"
            )}
          </Button>
        </div>
        <p className="text-xs text-neutral-600 mt-2 text-center">
          No login required. We only read public inventory data.
        </p>
      </form>

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto mb-8 p-4 rounded-xl border border-red-500/30 bg-red-500/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300">{error}</p>
            <p className="text-xs text-red-400/60 mt-1">
              Make sure your Steam profile and game details are set to public in your{" "}
              <a
                href="https://steamcommunity.com/my/edit/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-red-300"
              >
                Steam Privacy Settings
              </a>
              .
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <DollarSign className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{formatPrice(result.totalValue)}</p>
              <p className="text-xs text-neutral-500">Total Value</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Package className="h-5 w-5 text-purple-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{result.totalItems}</p>
              <p className="text-xs text-neutral-500">Total Items</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Backpack className="h-5 w-5 text-blue-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{result.uniqueItems}</p>
              <p className="text-xs text-neutral-500">Unique Items</p>
            </div>
          </div>

          {/* Item List */}
          {result.items.length === 0 ? (
            <div className="text-center py-16 text-neutral-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-neutral-700" />
              <p>No S&box items found in this inventory.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/30">
              <table className="w-full">
                <thead className="border-b border-neutral-800 bg-neutral-900/50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-left uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Unit Price</th>
                    <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-center uppercase tracking-wider w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {result.items.map((item, i) => (
                    <tr key={i} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ItemImage
                            src={item.imageUrl}
                            name={item.name}
                            type={item.type}
                            size="sm"
                            className="h-10 w-10 rounded-lg border border-neutral-700/50 shrink-0"
                          />
                          <div className="min-w-0">
                            {item.slug ? (
                              <Link
                                href={`/items/${item.slug}`}
                                className="text-sm font-medium text-neutral-100 hover:text-white truncate block"
                              >
                                {item.name}
                              </Link>
                            ) : (
                              <p className="text-sm font-medium text-neutral-100 truncate">{item.name}</p>
                            )}
                            <p className="text-[10px] text-neutral-500 capitalize">{item.type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-neutral-300">
                        {item.quantity > 1 ? `x${item.quantity}` : "1"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-neutral-400">
                        {item.unitPrice !== null ? formatPrice(item.unitPrice) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-white">
                        {item.totalPrice !== null ? formatPrice(item.totalPrice) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.slug && (
                          <Link
                            href={`/items/${item.slug}`}
                            className="text-neutral-500 hover:text-purple-400 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-neutral-700">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm font-medium text-neutral-400 text-right">
                      Total Inventory Value
                    </td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-emerald-400">
                      {formatPrice(result.totalValue)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

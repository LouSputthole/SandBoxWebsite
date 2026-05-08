"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Info,
  GitMerge,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface PreviewPair {
  name: string;
  orphan: {
    id: string;
    slug: string;
    currentPrice: number | null;
    imageUrl: string | null;
  };
  phantom: {
    id: string;
    slug: string;
    steamMarketId: string;
    currentPrice: number | null;
    volume: number | null;
    imageUrl: string | null;
    pricePointCount: number;
  };
}

interface UnpairedOrphan {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
}

interface UnpairedPhantom {
  id: string;
  name: string;
  slug: string;
  steamMarketId: string;
  currentPrice: number | null;
  volume: number | null;
  pricePointCount: number;
}

interface PreviewResult {
  pairCount: number;
  pairs: PreviewPair[];
  unpairedOrphans: UnpairedOrphan[];
  unpairedPhantoms: UnpairedPhantom[];
  hint: string;
}

interface MergeResult {
  success: boolean;
  merged: number;
  pairs: {
    name: string;
    keptId: string;
    deletedId: string;
    pricePointsMoved: number;
  }[];
  errors: string[];
}

/**
 * UI for the merge-orphan-items admin endpoint. Two-step flow:
 * preview the pairs first, then confirm to actually merge. The
 * underlying transaction is idempotent so re-running is safe, but
 * the preview step keeps the operator from being surprised.
 */
export default function MergeOrphanItemsPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [merge, setMerge] = useState<MergeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Manual-pair selections — one orphan id + one phantom id picked
  // from the unpaired lists. Empty string means "not yet picked".
  const [manualOrphanId, setManualOrphanId] = useState("");
  const [manualPhantomId, setManualPhantomId] = useState("");

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMerge(null);
    try {
      const res = await fetch("/api/admin/merge-orphan-items", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      const data = (await res.json()) as PreviewResult;
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [key]);

  const runManualMerge = useCallback(async () => {
    if (!manualOrphanId || !manualPhantomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/merge-orphan-items", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orphanId: manualOrphanId,
          phantomId: manualPhantomId,
        }),
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      const data = (await res.json()) as MergeResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Manual merge failed");
        return;
      }
      setMerge(data);
      setManualOrphanId("");
      setManualPhantomId("");
      // Re-scan so the lists update.
      const previewRes = await fetch("/api/admin/merge-orphan-items", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (previewRes.ok) {
        setPreview((await previewRes.json()) as PreviewResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [key, manualOrphanId, manualPhantomId]);

  const runMerge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/merge-orphan-items", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      const data = (await res.json()) as MergeResult;
      setMerge(data);
      // Refresh preview after merge so the operator sees pairCount go to 0.
      const previewRes = await fetch("/api/admin/merge-orphan-items", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (previewRes.ok) {
        setPreview((await previewRes.json()) as PreviewResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [key]);

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">
          Merge orphan items
        </h1>
        <p className="text-sm text-neutral-500 mb-6">
          Fold phantom Steam-row dupes into the matching sbox-row.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (key) setAuthed(true);
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            placeholder="Admin key (CRON_SECRET or ANALYTICS_KEY)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!key}>
            Continue
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Merge orphan items</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Fold phantom Steam-row dupes into their matching sbox-discovered
          rows.
        </p>
      </div>

      {/* Explainer */}
      <Card className="bg-blue-500/5 border-blue-500/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-300 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-200/90 leading-relaxed space-y-2 flex-1">
              <p className="font-semibold text-blue-200 text-sm">
                What this fixes
              </p>
              <p>
                Pre-PR-#68, when a new store drop got seeded by sbox.dev
                first and Steam Market listed it later, the sync created
                a duplicate row keyed by the slugified Steam hash_name
                instead of linking to the existing sbox row. The
                orphan (sbox row) keeps the rich metadata + correct slug
                but stays price-less; the phantom (Steam row) has the
                live price + market URL but a slugified slug and no
                sbox info.
              </p>
              <p>
                <strong>Preview first</strong> to inspect the pairs.
                Each merge runs in a transaction: PricePoints migrate
                from phantom → orphan, Steam fields copy onto the
                orphan, the phantom is deleted. Idempotent — running
                with no pairs is a no-op.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={fetchPreview}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          Preview
        </Button>
        <Button
          type="button"
          onClick={runMerge}
          disabled={loading || !preview || preview.pairCount === 0}
          className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitMerge className="h-4 w-4" />
          )}
          Merge {preview && preview.pairCount > 0 ? `(${preview.pairCount})` : ""}
        </Button>
      </div>

      {error && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-300 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Merge result summary */}
      {merge && (
        <Card
          className={
            merge.success
              ? "bg-emerald-500/5 border-emerald-500/30"
              : "bg-amber-500/5 border-amber-500/30"
          }
        >
          <CardContent className="p-5 flex items-start gap-3">
            <CheckCircle2
              className={`h-5 w-5 mt-0.5 shrink-0 ${
                merge.success ? "text-emerald-300" : "text-amber-300"
              }`}
            />
            <div className="text-sm flex-1">
              <p
                className={`font-semibold mb-1 ${
                  merge.success ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                Merged {merge.merged}{" "}
                {merge.merged === 1 ? "pair" : "pairs"}
                {merge.errors.length > 0 &&
                  ` (${merge.errors.length} error${
                    merge.errors.length === 1 ? "" : "s"
                  })`}
              </p>
              {merge.pairs.length > 0 && (
                <ul className="text-xs text-neutral-300 space-y-1 mt-2">
                  {merge.pairs.map((p) => (
                    <li key={p.deletedId}>
                      <strong>{p.name}</strong> — moved{" "}
                      {p.pricePointsMoved} price point
                      {p.pricePointsMoved === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              )}
              {merge.errors.length > 0 && (
                <ul className="text-xs text-amber-200/80 mt-2 space-y-1">
                  {merge.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview table */}
      {preview && !merge && (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">
                {preview.pairCount === 0
                  ? "No orphan/phantom pairs"
                  : `${preview.pairCount} pair${
                      preview.pairCount === 1 ? "" : "s"
                    } to merge`}
              </h2>
            </div>
            {preview.pairCount === 0 ? (
              <p className="text-sm text-neutral-500">{preview.hint}</p>
            ) : (
              <div className="space-y-3">
                {preview.pairs.map((p) => (
                  <PairCard key={p.phantom.id} pair={p} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Post-merge preview (pairCount should now be 0) */}
      {preview && merge && (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardContent className="p-5">
            <p className="text-sm text-neutral-300">
              {preview.pairCount === 0
                ? "No name-matched pairs remain."
                : `${preview.pairCount} pair(s) still detected. Re-run if desired.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manual-pair section — exposed when at least one of either
          unpaired side has rows. Useful for items whose sbox.dev
          display name diverges from Steam's hash_name (e.g. Cat
          Balaclava lives on sbox.dev under slug "toothpick"). */}
      {preview &&
        (preview.unpairedOrphans.length > 0 ||
          preview.unpairedPhantoms.length > 0) && (
          <Card className="bg-neutral-900/60 border-neutral-800">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white mb-1">
                  Manual pair
                </h2>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  When sbox.dev and Steam disagree on the display name
                  (Cat Balaclava ↔ Toothpick is the textbook case),
                  pick one orphan and one phantom and merge directly
                  by id.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
                    Orphan (sbox row, kept)
                  </label>
                  <select
                    value={manualOrphanId}
                    onChange={(e) => setManualOrphanId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md text-sm text-white px-2 py-2"
                  >
                    <option value="">— pick an orphan —</option>
                    {preview.unpairedOrphans.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.slug})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
                    Phantom (Steam row, deleted)
                  </label>
                  <select
                    value={manualPhantomId}
                    onChange={(e) => setManualPhantomId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md text-sm text-white px-2 py-2"
                  >
                    <option value="">— pick a phantom —</option>
                    {preview.unpairedPhantoms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.slug}
                        {p.currentPrice != null
                          ? ` · $${p.currentPrice.toFixed(2)}`
                          : ""}
                        )
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                type="button"
                onClick={runManualMerge}
                disabled={loading || !manualOrphanId || !manualPhantomId}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GitMerge className="h-4 w-4" />
                )}
                Merge picked pair
              </Button>

              {/* Show the unpaired lists side-by-side as a quick
                  diagnostic — operator can see at a glance what's
                  left to pair. Each entry links to the live item
                  page so the operator can compare visually. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <UnpairedList
                  label="Unpaired orphans"
                  tone="emerald"
                  items={preview.unpairedOrphans.map((o) => ({
                    id: o.id,
                    primary: o.name,
                    secondary: o.slug,
                    extra: null,
                  }))}
                />
                <UnpairedList
                  label="Unpaired phantoms"
                  tone="red"
                  items={preview.unpairedPhantoms.map((p) => ({
                    id: p.id,
                    primary: p.name,
                    secondary: p.slug,
                    extra:
                      p.currentPrice != null
                        ? `$${p.currentPrice.toFixed(2)} · ${
                            p.pricePointCount
                          } pp`
                        : `${p.pricePointCount} pp`,
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}

function PairCard({ pair }: { pair: PreviewPair }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <p className="text-sm font-semibold text-white mb-2">{pair.name}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <Side
          label="Orphan (kept)"
          tone="emerald"
          slug={pair.orphan.slug}
          rows={[
            ["Slug", pair.orphan.slug],
            [
              "Price",
              pair.orphan.currentPrice == null
                ? "—"
                : `$${pair.orphan.currentPrice.toFixed(2)}`,
            ],
            ["Image", pair.orphan.imageUrl ? "yes" : "no"],
          ]}
        />
        <Side
          label="Phantom (deleted)"
          tone="red"
          slug={pair.phantom.slug}
          rows={[
            ["Slug", pair.phantom.slug],
            ["Steam hash", pair.phantom.steamMarketId],
            [
              "Price",
              pair.phantom.currentPrice == null
                ? "—"
                : `$${pair.phantom.currentPrice.toFixed(2)}`,
            ],
            [
              "Volume",
              pair.phantom.volume == null ? "—" : String(pair.phantom.volume),
            ],
            ["Price points", String(pair.phantom.pricePointCount)],
          ]}
        />
      </div>
    </div>
  );
}

function UnpairedList({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "emerald" | "red";
  items: { id: string; primary: string; secondary: string; extra: string | null }[];
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/30 text-emerald-300"
      : "border-red-500/30 text-red-300";
  return (
    <div className={`rounded-md border ${toneClass} bg-neutral-950/50 p-2`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold">
          {label} ({items.length})
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-neutral-500 italic">none</p>
      ) : (
        <ul className="space-y-0.5 text-[11px]">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2"
            >
              <Link
                href={`/items/${it.secondary}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-200 hover:text-white truncate inline-flex items-center gap-1"
              >
                {it.primary}
                <ExternalLink className="h-2.5 w-2.5 text-neutral-500" />
              </Link>
              {it.extra && (
                <span className="text-neutral-500 font-mono shrink-0">
                  {it.extra}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Side({
  label,
  tone,
  slug,
  rows,
}: {
  label: string;
  tone: "emerald" | "red";
  slug: string;
  rows: [string, string][];
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/30 text-emerald-300"
      : "border-red-500/30 text-red-300";
  return (
    <div className={`rounded-md border ${toneClass} bg-neutral-900/50 p-2`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold">
          {label}
        </span>
        <Link
          href={`/items/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-neutral-400 hover:text-white inline-flex items-center gap-0.5"
        >
          open
          <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>
      <dl className="space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="text-neutral-200 font-mono truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

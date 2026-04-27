"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Lock,
  Database,
  RefreshCw,
  Archive,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface TableStats {
  name: string;
  rowCount: number;
  totalBytes: number;
  totalSizePretty: string;
  indexBytes: number;
  indexSizePretty: string;
}

interface StorageStats {
  totalBytes: number;
  totalSizePretty: string;
  tables: TableStats[];
  projectedMonthlyGrowthBytes: number | null;
}

type ActionResult = Record<string, unknown> & { error?: string };

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Storage admin dashboard. Shows per-table DB size + row counts so the
 * operator can see growth coming before hitting quotas, with buttons to
 * run the downsampler + PageView rollup in dry-run and live modes.
 *
 * Actions are manual first-run, then the weekly cron takes over
 * (Sunday 04:00 UTC). Dry-run ALWAYS shows before enabling the cron so
 * the operator sees impact before it's automatic.
 */
export default function StorageAdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);

  const fetchStats = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/storage", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as StorageStats;
      setStats(payload);
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (authed) void fetchStats();
  }, [authed, fetchStats]);

  async function runAction(action: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setRunningAction(action);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/storage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as ActionResult;
      setLastResult(data);
      // Refresh stats after a real (non-dry-run) action so the table
      // sizes reflect the new numbers immediately.
      if (!action.includes("dry-run") && res.ok) await fetchStats();
    } catch (err) {
      setLastResult({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setRunningAction(null);
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Storage admin</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Per-table sizes + downsampler controls.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAuthed(true);
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            placeholder="Admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!key}>
            Continue
          </Button>
        </form>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>
    );
  }

  const biggest = stats?.tables.slice(0, 5) ?? [];
  const rest = stats?.tables.slice(5) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-purple-400" />
            Storage
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {stats?.totalSizePretty ?? "—"} total
            {stats?.projectedMonthlyGrowthBytes != null && (
              <>
                {" "}
                · projected +{prettyBytes(stats.projectedMonthlyGrowthBytes)}/mo
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Tables table */}
      <Card className="bg-neutral-900/60 border-neutral-800 mb-6">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="text-left px-4 py-3 font-medium">Table</th>
                <th className="text-right px-4 py-3 font-medium">Rows (est.)</th>
                <th className="text-right px-4 py-3 font-medium">Indexes</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {[...biggest, ...rest].map((t, idx) => {
                const pct =
                  stats?.totalBytes && stats.totalBytes > 0
                    ? (t.totalBytes / stats.totalBytes) * 100
                    : 0;
                return (
                  <tr
                    key={t.name}
                    className="border-b border-neutral-900 last:border-0"
                  >
                    <td className="px-4 py-3 text-white font-mono text-xs">
                      {t.name}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-right tabular-nums text-xs">
                      {t.rowCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-right tabular-nums text-xs">
                      {t.indexSizePretty}
                    </td>
                    <td className="px-4 py-3 text-white text-right tabular-nums text-xs">
                      {t.totalSizePretty}
                    </td>
                    <td className="px-4 py-3 w-40">
                      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            idx < 5 ? "bg-purple-500" : "bg-neutral-600"
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="bg-neutral-900/60 border-neutral-800 mb-4">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Archive className="h-4 w-4 text-purple-400" />
            <h3 className="text-white font-semibold">Cleanup actions</h3>
          </div>
          <p className="text-sm text-neutral-400 mb-4 leading-relaxed">
            Always run the dry-run first. Real runs are destructive but
            verified — the downsampler asserts pre/post medians match within
            0.5% on a sample of items before declaring success.
          </p>

          <div className="space-y-4">
            <ActionRow
              title="PricePoint downsampler"
              subtitle="Tier 2 (30-180d) → hourly · Tier 3 (180d+) → daily OHLC"
              dryRunAction="downsample-dry-run"
              runAction="downsample"
              dryRunLabel="Dry run"
              runLabel="Run downsample"
              running={runningAction}
              onRun={runAction}
            />
            <ActionRow
              title="PageView → DailyStats rollup"
              subtitle="Aggregate pageviews older than 30d into DailyStats, delete raw rows"
              dryRunAction="rollup-pageviews-dry-run"
              runAction="rollup-pageviews"
              dryRunLabel="Dry run"
              runLabel="Run rollup"
              running={runningAction}
              onRun={runAction}
            />
          </div>

          <p className="mt-4 text-[11px] text-neutral-600 leading-relaxed">
            Weekly cron (<code>/api/cron/storage-cleanup</code>, Sunday 04:00
            UTC) runs both in live mode. Triggered here = manual backfill or
            one-off. Idempotent: missed weeks catch up next run.
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      {lastResult && (
        <Card
          className={`border ${
            lastResult.error
              ? "bg-red-500/5 border-red-500/30"
              : "bg-emerald-500/5 border-emerald-500/30"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              {lastResult.error ? (
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium mb-2 ${
                    lastResult.error ? "text-red-300" : "text-emerald-300"
                  }`}
                >
                  {lastResult.error ? "Failed" : "Complete"}
                </p>
                <pre className="text-[11px] text-neutral-300 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed bg-neutral-950/60 rounded-md border border-neutral-800 p-3">
                  {JSON.stringify(lastResult, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActionRow({
  title,
  subtitle,
  dryRunAction,
  runAction,
  dryRunLabel,
  runLabel,
  running,
  onRun,
}: {
  title: string;
  subtitle: string;
  dryRunAction: string;
  runAction: string;
  dryRunLabel: string;
  runLabel: string;
  running: string | null;
  onRun: (action: string, confirmMsg?: string) => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-4 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white font-medium flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-neutral-500" />
          {title}
        </p>
        <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          disabled={running != null}
          onClick={() => onRun(dryRunAction)}
        >
          {running === dryRunAction ? "…" : dryRunLabel}
        </Button>
        <Button
          size="sm"
          disabled={running != null}
          onClick={() =>
            onRun(
              runAction,
              `Run "${runLabel}" for real? This will modify the database.`,
            )
          }
        >
          {running === runAction ? "…" : runLabel}
        </Button>
      </div>
    </div>
  );
}

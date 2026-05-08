"use client";

import { useState, useCallback } from "react";
import {
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface RunResult {
  ok: boolean;
  updated: number;
  failed: number;
  remaining: number;
  failures?: { name: string; reason: string }[];
  elapsedMs: number;
  message?: string;
}

/**
 * Manual trigger for the scrape-nameids cron. Useful when new
 * items just got linked to Steam and you want their order book
 * to populate immediately rather than wait for tomorrow's cron.
 * Capped at 40 items per run (matches the cron) — re-click if
 * remaining > 0.
 */
export default function ScrapeNameidsPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/cron/scrape-nameids", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        // Stay on the page so the user can correct the key without
        // retyping. The other admin endpoints accept either
        // CRON_SECRET or ANALYTICS_KEY — this one now does too.
        setError(
          "Auth rejected. Try the other admin key (CRON_SECRET or ANALYTICS_KEY).",
        );
        return;
      }
      const data = (await res.json()) as RunResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }, [key]);

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">
          Scrape order-book nameids
        </h1>
        <p className="text-sm text-neutral-500 mb-6">
          Auto-fills steamItemNameId for items that need order data.
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
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Scrape order-book nameids
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Populate Steam item_nameid for any item missing it so the
          buy/sell order book renders.
        </p>
      </div>

      <Card className="bg-blue-500/5 border-blue-500/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-300 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-200/90 leading-relaxed space-y-2 flex-1">
              <p>
                Same scrape that runs in the daily cron (5:30 UTC),
                but you can fire it on demand here. Each run does up
                to 40 items with 2s rate limiting between requests
                — about 80 seconds for a full run.
              </p>
              <p>
                After a successful run the order book on each
                affected item page populates within ~5 min (Redis
                cache TTL).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        type="button"
        onClick={run}
        disabled={running}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        Run scrape
      </Button>

      {error && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-300 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card
          className={
            result.ok
              ? "bg-emerald-500/5 border-emerald-500/30"
              : "bg-amber-500/5 border-amber-500/30"
          }
        >
          <CardContent className="p-5 flex items-start gap-3">
            <CheckCircle2
              className={`h-5 w-5 mt-0.5 shrink-0 ${
                result.ok ? "text-emerald-300" : "text-amber-300"
              }`}
            />
            <div className="text-sm flex-1">
              <p
                className={`font-semibold mb-2 ${
                  result.ok ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                {result.message ??
                  `Updated ${result.updated} · Failed ${result.failed} · ${result.remaining} remaining · ${result.elapsedMs}ms`}
              </p>
              {result.remaining > 0 && (
                <p className="text-[11px] text-neutral-400 mb-2">
                  {result.remaining} item(s) still missing. Click Run again
                  to continue (cron is capped at 40/run to stay inside
                  Vercel's function timeout).
                </p>
              )}
              {result.failures && result.failures.length > 0 && (
                <ul className="text-xs text-amber-200/80 space-y-1 mt-2">
                  {result.failures.map((f, i) => (
                    <li key={i}>
                      <strong>{f.name}</strong>: {f.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

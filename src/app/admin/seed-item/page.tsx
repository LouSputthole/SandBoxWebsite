"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Lock,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Globe,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Source = "auto" | "steam" | "sboxdev";

interface SuccessResult {
  success: true;
  source: "steam" | "sboxdev";
  itemId: string;
  slug: string;
  name: string;
  created: boolean;
  updated: boolean;
}

interface ErrorResult {
  error: string;
  hint?: string;
}

/**
 * Manual seed UI for catalog gaps. Steam search occasionally drops items
 * during pagination, and brand-new drops aren't on Steam Market yet —
 * neither path is automatic. This page lets the operator paste a name
 * (or a sbox.dev URL) and seed in one click.
 */
export default function SeedItemPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SuccessResult | ErrorResult | null>(
    null,
  );

  const submit = useCallback(async () => {
    if (!query.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/seed-item", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ query: query.trim(), source }),
      });
      if (res.status === 401) {
        setResult({ error: "Wrong admin key" });
        setAuthed(false);
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setSubmitting(false);
    }
  }, [key, query, source]);

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Seed item</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Add a missing item to the catalog by name or sbox.dev slug.
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

  const success = result && "success" in result && result.success;
  const error = result && "error" in result;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Seed missing item</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Force-add an item to the catalog when the regular sync misses it.
        </p>
      </div>

      {/* Instructions */}
      <Card className="bg-blue-500/5 border-blue-500/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-300 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-200/90 leading-relaxed space-y-3 flex-1">
              <p className="font-semibold text-blue-200 text-sm">
                When to use this page
              </p>
              <p>
                The catalog updates automatically a few times a day, but
                Steam&apos;s pagination occasionally drops items, and brand-
                new drops aren&apos;t on the Steam Market until they have
                listings. Use this when an item is on{" "}
                <a
                  href="https://sbox.dev/skins"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 underline hover:text-blue-200 inline-flex items-center gap-0.5"
                >
                  sbox.dev/skins
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>{" "}
                but not on sboxskins.gg yet (e.g. &quot;Hard Hat&quot;).
              </p>

              <div>
                <p className="font-semibold text-blue-200 mb-1">
                  Step-by-step
                </p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    Find the item on{" "}
                    <a
                      href="https://sbox.dev/skins"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 underline hover:text-blue-200"
                    >
                      sbox.dev/skins
                    </a>
                    .
                  </li>
                  <li>
                    Copy either the name (e.g.{" "}
                    <code className="bg-neutral-900/80 px-1 rounded">
                      Hard Hat
                    </code>
                    ) or the URL (e.g.{" "}
                    <code className="bg-neutral-900/80 px-1 rounded">
                      sbox.dev/skins/hard-hat
                    </code>
                    ).
                  </li>
                  <li>Paste into the form below and hit Seed.</li>
                  <li>
                    On success, click the link to verify the item page
                    renders. The next scheduled sync will fill in any
                    missing market data within an hour or two.
                  </li>
                </ol>
              </div>

              <div className="rounded border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                <p className="font-semibold text-blue-200 mb-1">
                  Mode tips
                </p>
                <ul className="space-y-1">
                  <li>
                    <strong>Auto</strong> (default): tries Steam first, then
                    sbox.dev if Steam doesn&apos;t have it. Use this if you
                    just want it added.
                  </li>
                  <li>
                    <strong>Steam Market</strong>: only succeeds if the
                    item is on the Steam Market with the exact name you
                    typed. Pulls full market data on first seed.
                  </li>
                  <li>
                    <strong>sbox.dev</strong>: pulls from sbox.dev directly.
                    Use for non-marketable or brand-new items. The item
                    will lack Steam Market price/volume until the next
                    automated sync picks it up.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-5 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
              Name or sbox.dev URL
            </label>
            <Input
              type="text"
              placeholder='e.g. "Hard Hat" or "sbox.dev/skins/hard-hat"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting && query.trim()) {
                  submit();
                }
              }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
              Source
            </label>
            <div className="grid grid-cols-3 gap-2">
              <SourceOption
                value="auto"
                current={source}
                onSelect={setSource}
                label="Auto"
                hint="Try both"
              />
              <SourceOption
                value="steam"
                current={source}
                onSelect={setSource}
                label="Steam Market"
                hint="Exact name"
              />
              <SourceOption
                value="sboxdev"
                current={source}
                onSelect={setSource}
                label="sbox.dev"
                hint="Slug or URL"
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={submit}
            disabled={submitting || !query.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Seed item
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {success && result && "success" in result && (
        <Card className="bg-emerald-500/5 border-emerald-500/30">
          <CardContent className="p-5 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-300 mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-emerald-200 mb-1">
                {result.created
                  ? "Item created"
                  : result.updated
                    ? "Item updated (already in catalog)"
                    : "Item present"}
              </p>
              <p className="text-neutral-300 mb-2">
                <strong>{result.name}</strong>{" "}
                <span className="text-neutral-500">
                  via {result.source === "steam" ? "Steam Market" : "sbox.dev"}
                </span>
              </p>
              <Link
                href={`/items/${result.slug}`}
                className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 underline"
              >
                Open item page
                <ExternalLink className="h-3 w-3" />
              </Link>
              {result.source === "sboxdev" && (
                <p className="text-[11px] text-emerald-200/70 mt-2 leading-relaxed">
                  Steam Market data (price, volume) will populate
                  automatically when the next scheduled sync sees a
                  listing for this item.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {error && result && "error" in result && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-300 mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-red-200 mb-1">
                Couldn&apos;t seed
              </p>
              <p className="text-neutral-300 mb-2">{result.error}</p>
              {result.hint && (
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  {result.hint}
                </p>
              )}
              <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
                Common fixes: try the sbox.dev URL directly (e.g.{" "}
                <code className="bg-neutral-900/80 px-1 rounded">
                  sbox.dev/skins/hard-hat
                </code>
                ), or check{" "}
                <a
                  href="https://sbox.dev/skins"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-neutral-400 hover:text-white inline-flex items-center gap-0.5"
                >
                  sbox.dev/skins
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>{" "}
                for the exact name.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SourceOption({
  value,
  current,
  onSelect,
  label,
  hint,
}: {
  value: Source;
  current: Source;
  onSelect: (v: Source) => void;
  label: string;
  hint: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`text-left rounded-lg border px-3 py-2 transition ${
        active
          ? "border-purple-500/50 bg-purple-500/10"
          : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
      }`}
    >
      <div
        className={`text-sm font-semibold flex items-center gap-1.5 ${active ? "text-purple-200" : "text-white"}`}
      >
        {value === "sboxdev" && <Globe className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{hint}</div>
    </button>
  );
}


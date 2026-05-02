"use client";

import { useState, useCallback } from "react";
import {
  Lock,
  Loader2,
  Bug,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Tool = "sbox-skin" | "sbox-list" | "sboxgame";

interface ToolDef {
  id: Tool;
  label: string;
  hint: string;
  needsInput: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  buildUrl: (input: string) => string;
}

/**
 * Strip URL prefix + fragment + query so a pasted full URL becomes a
 * bare slug. Accepts:
 *   - "hard-hat"
 *   - "/skins/hard-hat"
 *   - "https://sbox.dev/skins/hard-hat"
 *   - "https://sbox.dev/skins/paper-3d-glasses#overview"
 *   - "https://sbox.dev/skins/foo?ref=bar"
 * Returns just the slug. The API's strict regex won't accept the
 * URL-paste forms, so we normalize client-side.
 */
function cleanSlug(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:www\.)?sbox\.dev\/skins\//, "")
    .replace(/^https?:\/\/(?:www\.)?sbox\.game\/[a-z]+\//, "")
    .replace(/^\//, "")
    .split(/[?#]/)[0];
}

/**
 * Same idea for the sbox.game metrics tool — accept a numeric id, a
 * full URL, or a path. The API expects a bare numeric/alnum string.
 */
function cleanGameId(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:www\.)?sbox\.game\/metrics\/skins\//, "")
    .replace(/^\//, "")
    .split(/[?#]/)[0];
}

const TOOLS: ToolDef[] = [
  {
    id: "sbox-skin",
    label: "sbox.dev per-skin",
    hint: "Fetch a single skin's raw JSON from sbox.dev's API and show every URL-shaped field. You can paste a full sbox.dev/skins/... URL or just the slug.",
    needsInput: true,
    inputLabel: "Skin slug or sbox.dev URL",
    inputPlaceholder: "e.g. hard-hat or https://sbox.dev/skins/...",
    buildUrl: (s: string) =>
      `/api/admin/debug-sbox?slug=${encodeURIComponent(cleanSlug(s))}`,
  },
  {
    id: "sbox-list",
    label: "sbox.dev list probe",
    hint: "Run the discover-cron list probe across every candidate URL + HTML scrape fallback. Shows which one (if any) returns a skins list. Use after the discover-cron returns 0 items.",
    needsInput: false,
    buildUrl: () => "/api/admin/debug-sbox-list",
  },
  {
    id: "sboxgame",
    label: "sbox.game metrics",
    hint: "Fetch sbox.game/metrics/skins/<id>. You can paste a full sbox.game URL or just the workshop id.",
    needsInput: true,
    inputLabel: "Workshop ID or sbox.game URL",
    inputPlaceholder: "e.g. 756702 or https://sbox.game/metrics/skins/...",
    buildUrl: (s: string) =>
      `/api/admin/debug-sboxgame?id=${encodeURIComponent(cleanGameId(s))}`,
  },
];

/**
 * Mobile-friendly admin debug console. Same shape as /admin/seed-item:
 * one password gate, then a tabbed interface across the three diagnostic
 * endpoints. Output renders as a syntax-friendly JSON dump with a
 * one-tap "Copy result" button so you can paste into chat without
 * fumbling for select-all on a phone.
 */
export default function AdminDebugPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tool, setTool] = useState<Tool>("sbox-skin");
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const def = TOOLS.find((t) => t.id === tool)!;

  const run = useCallback(async () => {
    if (def.needsInput && !input.trim()) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(def.buildUrl(input), {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setError("Wrong admin key");
        setAuthed(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setResult(data);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }, [def, input, key]);

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Phones with restricted clipboard — silently no-op
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Debug</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Diagnostic endpoints for sbox.dev / sbox.game data sources.
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
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Debug</h1>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Run a diagnostic, copy the JSON, send it back.
        </p>
      </div>

      {/* Tool picker — segmented control. Tap-friendly on mobile. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TOOLS.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTool(t.id);
                setInput("");
                setResult(null);
                setError(null);
              }}
              className={`text-left rounded-lg border px-3 py-2 transition ${
                active
                  ? "border-purple-500/50 bg-purple-500/10"
                  : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
              }`}
            >
              <div
                className={`text-sm font-semibold ${active ? "text-purple-200" : "text-white"}`}
              >
                {t.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active tool form */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-neutral-400 leading-relaxed">{def.hint}</p>

          {def.needsInput && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
                {def.inputLabel}
              </label>
              <Input
                type="text"
                placeholder={def.inputPlaceholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !running) run();
                }}
                autoFocus
                autoComplete="off"
                inputMode={tool === "sboxgame" ? "numeric" : undefined}
              />
            </div>
          )}

          <Button
            type="button"
            onClick={run}
            disabled={running || (def.needsInput && !input.trim())}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Run diagnostic
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {(result || error) && (
        <Card
          className={
            error
              ? "bg-red-500/5 border-red-500/30"
              : "bg-neutral-900/60 border-neutral-800"
          }
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                {error ? "Result (with error)" : "Result"}
              </span>
              {result != null && (
                <button
                  type="button"
                  onClick={copyResult}
                  className="text-[11px] text-neutral-400 hover:text-white inline-flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy
                    </>
                  )}
                </button>
              )}
            </div>
            {error && (
              <p className="text-xs text-red-300 mb-2 font-mono">{error}</p>
            )}
            <pre className="text-[11px] text-neutral-300 bg-neutral-950/60 rounded-lg border border-neutral-800 p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[60vh] overflow-y-auto">
              {result != null
                ? JSON.stringify(result, null, 2)
                : "(no body)"}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

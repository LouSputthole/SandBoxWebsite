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
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface SuccessResult {
  success: true;
  before: { name: string; slug: string };
  after: { name: string; slug: string };
  hint?: string;
}

interface ErrorResult {
  error: string;
}

/**
 * Surgical rename for a single Item row by id. Use case is undoing
 * a wrong orphan/phantom merge (the surviving row has the wrong
 * name/slug for its Steam data) and other one-off relabel needs.
 */
export default function RelabelItemPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SuccessResult | ErrorResult | null>(
    null,
  );

  const submit = useCallback(async () => {
    const trimmedId = id.trim();
    if (!trimmedId) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/relabel-item", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: trimmedId,
          name: name.trim() || undefined,
          slug: slug.trim() || undefined,
        }),
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
  }, [key, id, name, slug]);

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Relabel item</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Rename / reslug a single Item row by id.
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
        <h1 className="text-2xl font-bold text-white">Relabel item</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Update name + slug on a single Item row by id. Useful for undoing
          a mistaken merge.
        </p>
      </div>

      <Card className="bg-blue-500/5 border-blue-500/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-300 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-200/90 leading-relaxed space-y-2 flex-1">
              <p>
                Common use: a merge folded an orphan + phantom that
                shouldn&apos;t have been paired (e.g. Brown Leather Coat
                ↔ Leather Coat). The surviving row has the right Steam
                data but the wrong identity. Relabel it to the correct
                name + slug, then optionally hit Seed item with the new
                slug to refresh sbox.dev metadata for it.
              </p>
              <p>
                Find the id from the merge-orphan-items preview, the
                items list, or directly via{" "}
                <code className="bg-neutral-900/80 px-1 rounded">
                  GET /api/admin/merge-orphan-items
                </code>
                .
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="p-5 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
              Item id
            </label>
            <Input
              type="text"
              placeholder="cm... (Prisma cuid)"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
              New name (optional if slug provided)
            </label>
            <Input
              type="text"
              placeholder="e.g. Leather Coat"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
              New slug (optional, derived from name if blank)
            </label>
            <Input
              type="text"
              placeholder="e.g. leather-coat"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Kebab-case only. Must not collide with another item&apos;s
              slug.
            </p>
          </div>

          <Button
            type="button"
            onClick={submit}
            disabled={submitting || !id.trim() || (!name.trim() && !slug.trim())}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Tag className="h-4 w-4" />
            )}
            Relabel
          </Button>
        </CardContent>
      </Card>

      {success && result && "success" in result && (
        <Card className="bg-emerald-500/5 border-emerald-500/30">
          <CardContent className="p-5 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-300 mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-emerald-200 mb-2">
                Relabeled
              </p>
              <dl className="text-xs space-y-1 mb-3">
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Before</dt>
                  <dd className="text-neutral-300 font-mono truncate">
                    {result.before.name} ({result.before.slug})
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">After</dt>
                  <dd className="text-emerald-200 font-mono truncate">
                    {result.after.name} ({result.after.slug})
                  </dd>
                </div>
              </dl>
              <Link
                href={`/items/${result.after.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 underline"
              >
                Open item page
                <ExternalLink className="h-3 w-3" />
              </Link>
              {result.hint && (
                <p className="text-[11px] text-emerald-200/70 mt-3 leading-relaxed">
                  {result.hint}
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
                Couldn&apos;t relabel
              </p>
              <p className="text-neutral-300">{result.error}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

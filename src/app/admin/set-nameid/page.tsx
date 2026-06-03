"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Save,
  RefreshCw,
  Bookmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

// One-click "grabber" bookmarklet. Drag it to the bookmarks bar; on a
// logged-in Steam Market item page it reads the nameid out of the
// Market_LoadOrderSpread(<id>) call and the market_hash_name out of the URL,
// then opens this page pre-filled. Intentionally backslash-free so it stays a
// safe double-quoted TS string — DO NOT alter this string.
const BOOKMARKLET = "javascript:(function(){var s=document.documentElement.innerHTML,k='Market_LoadOrderSpread(',i=s.indexOf(k);if(i<0){alert('No nameid found. Open a Steam Market item page while logged in, then click this again.');return;}var j=s.indexOf(')',i),id=s.slice(i+k.length,j).trim();var p=location.pathname.split('/'),h=decodeURIComponent(p[p.length-1]||'');if(!/^[0-9]+$/.test(id)||!h){alert('Could not read the nameid. Make sure you are on a Steam Market item listing page.');return;}window.open('https://sboxskins.gg/admin/set-nameid?hash='+encodeURIComponent(h)+'&nameid='+id,'_blank');})();";

interface MissingItem {
  slug: string;
  name: string;
  steamMarketId: string | null;
}

interface MissingResponse {
  count: number;
  items: MissingItem[];
}

interface PostResult {
  ok: boolean;
  updated: number;
  notFound: string[];
}

/**
 * Manually set an item's Steam item_nameid so its buy/sell order book can
 * render. Companion to /admin/scrape-nameids: use this when the cron can't
 * scrape the nameid from Vercel and you grab it by hand from a logged-in
 * Steam Market page. Shows the current backlog of items still missing one.
 */
export default function SetNameidPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);

  // Worklist of items still missing a nameid.
  const [missing, setMissing] = useState<MissingItem[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Submit form state.
  const [slug, setSlug] = useState("");
  const [nameid, setNameid] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // When arriving from the bookmarklet we get a Steam market_hash_name (and
  // nameid) in the query string instead of a slug. We resolve the item by
  // hash server-side, so we just stash the hash and submit it instead of slug.
  const [bookmarkletHash, setBookmarkletHash] = useState<string | null>(null);

  // React strips javascript: hrefs, so we set the draggable link's href
  // imperatively after mount (see the install card below).
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  // Pre-fill from the bookmarklet's ?hash=&nameid= query params on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qHash = params.get("hash");
    const qNameid = params.get("nameid");
    if (qNameid) setNameid(qNameid);
    if (qHash) setBookmarkletHash(qHash);
  }, []);

  // Install the javascript: href onto the draggable link after render.
  useEffect(() => {
    linkRef.current?.setAttribute("href", BOOKMARKLET);
  }, []);

  // Same admin-key mechanism as scrape-nameids/page.tsx: the key the user
  // typed on the gate is sent as a bearer on every request.
  const loadMissing = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/admin/items-missing-nameid", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        setListError(
          "Auth rejected. Try the other admin key (CRON_SECRET or ANALYTICS_KEY).",
        );
        return;
      }
      const data = (await res.json()) as MissingResponse;
      setMissing(data.items);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoadingList(false);
    }
  }, [key]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const trimmedSlug = slug.trim();
      // Prefer the typed slug; fall back to the bookmarklet's hash when the
      // slug field is empty. The endpoint resolves a hash via steamMarketId.
      const payload =
        !trimmedSlug && bookmarkletHash
          ? { hash: bookmarkletHash, nameid: nameid.trim() }
          : { slug: trimmedSlug, nameid: nameid.trim() };
      const res = await fetch("/api/admin/item-nameid", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setSubmitError(
          "Auth rejected. Try the other admin key (CRON_SECRET or ANALYTICS_KEY).",
        );
        return;
      }
      const data = (await res.json()) as PostResult & { error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setResult(data);
      if (data.updated > 0) {
        // Clear the form and refresh the worklist so the item we just set
        // drops off the list. Also drop the bookmarklet hash now it's saved.
        setSlug("");
        setNameid("");
        setBookmarkletHash(null);
        void loadMissing();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }, [key, slug, nameid, bookmarkletHash, loadMissing]);

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Set item nameid</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Manually fill steamItemNameId so an item&apos;s order book renders.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (key) {
              setAuthed(true);
              void loadMissing();
            }
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
        <h1 className="text-2xl font-bold text-white">Set item nameid</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Manually set Steam item_nameid for an item so its buy/sell order
          book renders. Use when the scrape cron can&apos;t fetch it.
        </p>
      </div>

      {/* One-click grabber install */}
      <Card className="bg-purple-500/5 border-purple-500/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Bookmark className="h-4 w-4 text-purple-300 mt-0.5 shrink-0" />
            <div className="text-xs text-purple-100/90 leading-relaxed space-y-3 flex-1 min-w-0">
              <p className="font-semibold text-purple-200">
                Install the 1-click grabber
              </p>
              {/* Draggable bookmarklet. React strips javascript: hrefs, so the
                  href is set imperatively via linkRef in a useEffect above;
                  onClick preventDefault stops a click from navigating. */}
              <a
                ref={linkRef}
                href="#"
                onClick={(e) => e.preventDefault()}
                draggable
                className="inline-flex cursor-grab items-center gap-2 rounded-md border border-purple-400/40 bg-purple-600/30 px-3 py-2 font-semibold text-purple-50 transition hover:bg-purple-600/50 active:cursor-grabbing"
              >
                <Bookmark className="h-3.5 w-3.5" />
                📌 Grab nameid &rarr; sbox
              </a>
              <p>
                Drag the button to your bookmarks bar (or make a new bookmark
                and paste the code below as its URL). Then on any S&box
                item&apos;s Steam Market page (logged in), click it &mdash; it
                reads the nameid and opens this page pre-filled.
              </p>
              <pre className="overflow-x-auto rounded bg-black/40 p-2">
                <code className="font-mono text-[10px] leading-snug text-purple-100/80 break-all whitespace-pre-wrap">
                  {BOOKMARKLET}
                </code>
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-500/5 border-blue-500/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-300 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-200/90 leading-relaxed space-y-2 flex-1">
              <p className="font-semibold text-blue-200">
                How to find an item&apos;s nameid
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Open the item&apos;s Steam Market page while logged in to
                  Steam.
                </li>
                <li>
                  View Source (right-click &rarr; View Page Source, or
                  Ctrl+U).
                </li>
                <li>
                  Find{" "}
                  <code className="rounded bg-blue-500/10 px-1 py-0.5 font-mono text-blue-100">
                    Market_LoadOrderSpread(&lt;number&gt;)
                  </code>
                  &nbsp;&mdash; that number is the nameid.
                </li>
              </ol>
              <p>
                Paste it below with the item&apos;s slug. The order book on
                the item page populates within ~5&nbsp;min (Redis cache TTL).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit form */}
      <Card className="bg-neutral-900/40 border-neutral-800">
        <CardContent className="p-5">
          {bookmarkletHash && (
            <div className="mb-3 rounded-md border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-200">
              From bookmarklet &mdash; Steam item:{" "}
              <span className="font-mono break-all text-purple-100">
                {bookmarkletHash}
              </span>
              <span className="block text-purple-200/70 mt-0.5">
                Leave the slug blank to save against this item.
              </span>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nameid.trim() && (slug.trim() || bookmarkletHash))
                void submit();
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="slug"
                className="block text-xs font-medium text-neutral-400"
              >
                Item slug
              </label>
              <Input
                id="slug"
                placeholder="e.g. cardboard-king"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="nameid"
                className="block text-xs font-medium text-neutral-400"
              >
                item_nameid (digits only)
              </label>
              <Input
                id="nameid"
                inputMode="numeric"
                placeholder="e.g. 176321149"
                value={nameid}
                onChange={(e) => setNameid(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              disabled={
                submitting ||
                !nameid.trim() ||
                (!slug.trim() && !bookmarkletHash)
              }
              className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save nameid
            </Button>
          </form>
        </CardContent>
      </Card>

      {submitError && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-300 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">{submitError}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card
          className={
            result.updated > 0
              ? "bg-emerald-500/5 border-emerald-500/30"
              : "bg-amber-500/5 border-amber-500/30"
          }
        >
          <CardContent className="p-5 flex items-start gap-3">
            <CheckCircle2
              className={`h-5 w-5 mt-0.5 shrink-0 ${
                result.updated > 0 ? "text-emerald-300" : "text-amber-300"
              }`}
            />
            <div className="text-sm flex-1">
              <p
                className={`font-semibold ${
                  result.updated > 0 ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                {result.updated > 0
                  ? `Updated ${result.updated} item${result.updated === 1 ? "" : "s"}.`
                  : "No item matched that slug."}
              </p>
              {result.notFound.length > 0 && (
                <p className="text-[11px] text-amber-200/80 mt-1">
                  Not found: {result.notFound.join(", ")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Worklist */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-semibold text-white">
          Items missing a nameid
          {missing ? (
            <span className="ml-2 text-xs font-normal text-neutral-500">
              {missing.length}
              {missing.length === 500 ? "+" : ""}
            </span>
          ) : null}
        </h2>
        <Button
          type="button"
          variant="outline"
          onClick={loadMissing}
          disabled={loadingList}
          className="h-8 gap-1.5 text-xs"
        >
          {loadingList ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {listError && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-300 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">{listError}</p>
          </CardContent>
        </Card>
      )}

      {missing && missing.length === 0 && !listError && (
        <Card className="bg-neutral-900/40 border-neutral-800">
          <CardContent className="p-5 text-center text-sm text-neutral-500">
            Every item with a Steam Market listing already has a nameid. 🎉
          </CardContent>
        </Card>
      )}

      {missing && missing.length > 0 && (
        <Card className="bg-neutral-900/40 border-neutral-800">
          <CardContent className="p-0 divide-y divide-neutral-800">
            {missing.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => {
                  setSlug(item.slug);
                  setResult(null);
                  setSubmitError(null);
                }}
                className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-neutral-800/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {item.name}
                  </p>
                  <p className="truncate font-mono text-[11px] text-neutral-500">
                    {item.slug}
                  </p>
                </div>
                {item.steamMarketId && (
                  <span className="shrink-0 font-mono text-[11px] text-neutral-600">
                    {item.steamMarketId}
                  </span>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

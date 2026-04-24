"use client";

import { useState } from "react";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Newsletter signup card. Posts to /api/newsletter/subscribe.
 *
 * Two checkboxes, one submit. Defaults to the Monday outlook since that's
 * our differentiated/signal-driven product — Friday is a recap.
 *
 * On success we show a confirm-your-email message (double opt-in). We
 * never reveal whether the email was already in the DB (enumeration
 * oracle), so the success state is the same whether it's a net-new
 * signup or a resub.
 */
export function NewsletterSignupForm({ id = "newsletter" }: { id?: string }) {
  const [email, setEmail] = useState("");
  const [kinds, setKinds] = useState<Set<string>>(new Set(["monday-outlook"]));
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function toggle(kind: string) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kinds.size === 0) {
      setErrorMsg("Pick at least one newsletter.");
      setState("error");
      return;
    }
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, kinds: Array.from(kinds) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrorMsg(data.error ?? "Something went wrong. Try again shortly.");
        setState("error");
        return;
      }
      setState("ok");
    } catch {
      setErrorMsg("Couldn't reach the server. Check your connection.");
      setState("error");
    }
  }

  if (state === "ok") {
    return (
      <div
        id={id}
        className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-6 text-center"
      >
        <CheckCircle2 className="h-8 w-8 text-purple-300 mx-auto mb-3" />
        <h3 className="text-white font-semibold mb-1">You're in.</h3>
        <p className="text-sm text-neutral-400">
          <span className="text-purple-200">{email}</span> is subscribed. Watch
          your inbox for a welcome note and the next issue.
        </p>
      </div>
    );
  }

  return (
    <form
      id={id}
      onSubmit={submit}
      className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-4 w-4 text-purple-400" />
        <h3 className="text-white font-semibold">Market newsletter</h3>
      </div>
      <p className="text-sm text-neutral-400 mb-4 leading-relaxed">
        Signal-driven analysis of the S&box skin market. The Monday outlook
        is forward-looking (momentum rankings + our read on the week). The
        Friday wrap covers what actually happened. Pick one or both.
      </p>
      <div className="space-y-2 mb-4">
        <label className="flex items-start gap-3 text-sm cursor-pointer group">
          <input
            type="checkbox"
            checked={kinds.has("monday-outlook")}
            onChange={() => toggle("monday-outlook")}
            className="mt-0.5 accent-purple-500"
          />
          <span>
            <span className="text-neutral-100 group-hover:text-white">
              Monday outlook
            </span>
            <span className="text-neutral-500 ml-2">
              forward-looking, momentum-ranked
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer group">
          <input
            type="checkbox"
            checked={kinds.has("friday-report")}
            onChange={() => toggle("friday-report")}
            className="mt-0.5 accent-purple-500"
          />
          <span>
            <span className="text-neutral-100 group-hover:text-white">
              Friday wrap
            </span>
            <span className="text-neutral-500 ml-2">
              week in review + category breakdown
            </span>
          </span>
        </label>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md bg-neutral-950/60 border border-neutral-700 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500"
        />
        <button
          type="submit"
          disabled={state === "loading" || !email}
          className="rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          {state === "loading" ? "…" : "Subscribe"}
        </button>
      </div>
      {state === "error" && errorMsg && (
        <p className="mt-3 text-sm text-red-400 flex items-start gap-1.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </p>
      )}
      <p className="mt-3 text-[11px] text-neutral-600">
        Double opt-in. One-click unsubscribe in every email. No spam, no
        selling addresses — we've built this for traders, not marketers.
      </p>
    </form>
  );
}

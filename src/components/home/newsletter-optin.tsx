"use client";

import { useState } from "react";
import { Check, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Arcade newsletter opt-in: two-column card (copy + selectable Monday/Friday
 * cards, email, subscribe). Posts to /api/newsletter/subscribe with the same
 * contract + double-opt-in success behavior as the shared signup form, just
 * restyled to the redesign. Defaults to the Monday outlook.
 */
export function NewsletterOptin() {
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
        const data = (await res.json().catch(() => ({}))) as { error?: string };
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

  return (
    <div className="relative grid grid-cols-1 items-center gap-9 overflow-hidden rounded-[24px] border border-line bg-gradient-to-br from-panel to-panel2 p-9 lg:grid-cols-2">
      <div
        className="pointer-events-none absolute -right-10 -top-24 h-[340px] w-[340px] rounded-full"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 64%)",
          filter: "blur(20px)",
        }}
      />
      <div className="relative">
        <h2 className="mb-2.5 font-display text-[28px] font-extrabold tracking-[-.5px] text-tx">
          Never miss a drop.
        </h2>
        <p className="text-[14.5px] leading-[1.55] text-mut">
          Get the Monday outlook (momentum + our read on the week) and the Friday
          wrap (what actually happened). Pick one or both — built for traders, not
          marketers.
        </p>
      </div>

      <div className="relative">
        {state === "ok" ? (
          <div className="flex flex-col items-center rounded-[16px] border border-line bg-bg2 px-6 py-8 text-center">
            <CheckCircle2 className="mb-3 h-8 w-8 text-accent" />
            <h3 className="mb-1 font-display text-lg font-bold text-tx">You&apos;re in.</h3>
            <p className="text-sm text-mut">
              <span className="text-accent">{email}</span> is subscribed. Watch your
              inbox for a welcome note and the next issue.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="mb-3.5 flex gap-2.5">
              <OptCard
                active={kinds.has("monday-outlook")}
                title="Monday outlook"
                subtitle="Forward-looking · momentum"
                onClick={() => toggle("monday-outlook")}
              />
              <OptCard
                active={kinds.has("friday-report")}
                title="Friday wrap"
                subtitle="Week in review"
                onClick={() => toggle("friday-report")}
              />
            </div>
            <div className="flex gap-2.5">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className="h-[50px] flex-1 rounded-[14px] border border-line bg-bg2 px-4 text-sm text-tx placeholder:text-faint outline-none focus:[border-color:var(--accent)]"
              />
              <button
                type="submit"
                disabled={state === "loading" || !email}
                className="inline-flex h-[50px] items-center rounded-[14px] bg-accent px-6 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_var(--accent)] transition-[filter] hover:brightness-[1.07] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === "loading" ? "…" : "Subscribe"}
              </button>
            </div>
            {state === "error" && errorMsg && (
              <p className="mt-3 flex items-start gap-1.5 text-sm text-down">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </p>
            )}
            <p className="mt-3 text-[11px] text-faint">
              Double opt-in. One-click unsubscribe in every email. No spam, no
              selling addresses.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function OptCard({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 rounded-[14px] border-[1.5px] px-[15px] py-[13px] text-left transition-colors"
      style={
        active
          ? {
              borderColor: "var(--accent)",
              background: "color-mix(in srgb, var(--accent) 9%, transparent)",
            }
          : { borderColor: "var(--line)", background: "var(--bg2)" }
      }
    >
      <span className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-tx">{title}</span>
        {active ? (
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[6px] bg-accent text-white">
            <Check className="h-3 w-3" strokeWidth={3.5} />
          </span>
        ) : (
          <span className="inline-block h-[18px] w-[18px] rounded-[6px] border-[1.5px] border-faint" />
        )}
      </span>
      <span className="mt-1 block text-[11.5px] text-mut">{subtitle}</span>
    </button>
  );
}

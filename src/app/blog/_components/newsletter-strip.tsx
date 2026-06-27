"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Arcade newsletter strip for the blog index — horizontal: copy on the
 * left, email + Subscribe on the right. Wired to the real single-opt-in
 * endpoint (`POST /api/newsletter/subscribe`); subscribes to both the
 * Monday outlook and Friday wrap, matching the strip's promise.
 */
export function NewsletterStrip() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          kinds: ["monday-outlook", "friday-report"],
        }),
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

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-6 rounded-[20px] border border-line bg-[linear-gradient(135deg,var(--panel),var(--panel2))] px-8 py-7">
      <div className="min-w-0">
        <h2 className="m-0 mb-1.5 font-display text-[22px] font-extrabold tracking-[-0.4px] text-tx">
          Get reports in your inbox
        </h2>
        <p className="m-0 text-[13.5px] text-mut">
          Monday outlook + Friday wrap. No spam, unsubscribe anytime.
        </p>
      </div>

      {state === "ok" ? (
        <div className="flex items-center gap-2.5 text-[14px] text-up">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-medium text-tx">
            You&rsquo;re in — watch your inbox.
          </span>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex gap-2.5">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-[240px] max-w-full rounded-[13px] border border-line bg-bg2 px-4 text-[14px] text-tx outline-none placeholder:text-faint focus:border-accent"
            />
            <Button
              type="submit"
              size="lg"
              disabled={state === "loading" || !email}
              className="h-12 px-6"
            >
              {state === "loading" ? "…" : "Subscribe"}
            </Button>
          </div>
          {state === "error" && errorMsg && (
            <p className="m-0 flex items-start gap-1.5 text-[12.5px] text-down">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </p>
          )}
        </form>
      )}
    </div>
  );
}

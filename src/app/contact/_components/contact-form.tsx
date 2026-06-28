"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMAIL = "sboxskins@gmail.com";
const TWITTER = "SboxSkinsgg";

/**
 * Arcade "Still have questions?" contact card (mockup: FAQ.dc.html contact
 * block). Name / email / message form on a gradient panel with a radial accent
 * glow, focus-accent inputs, and a purple Send button.
 *
 * Behavior mirrors the site's existing contact path (mailto) — there is no
 * contact API endpoint, so Send composes a pre-filled email to the support
 * inbox, preserving the old /contact page's "email us" behavior.
 */
export function ContactForm({
  title,
  description,
  showEmail = false,
  id,
  className,
}: {
  title?: string;
  description?: string;
  showEmail?: boolean;
  id?: string;
  className?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `sboxskins.gg — message from ${name || "a visitor"}`;
    const body = `Name: ${name}\nEmail: ${email}\n\n${message}`;
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div
      id={id}
      className={cn(
        "relative overflow-hidden rounded-[20px] border border-line bg-gradient-to-br from-panel to-panel2 p-8",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[50px] -top-[90px] h-[300px] w-[300px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent), transparent 65%)",
          filter: "blur(20px)",
        }}
      />
      <div className="relative">
        {title && (
          <h2 className="mb-1.5 font-display text-[26px] font-extrabold tracking-[-.5px] text-tx">
            {title}
          </h2>
        )}
        {description && (
          <p className="mb-[22px] text-sm text-mut">{description}</p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              autoComplete="name"
              aria-label="Your name"
              required
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-[13px] border border-line bg-bg2 px-4 text-sm text-tx outline-none placeholder:text-faint focus:[border-color:var(--accent)]"
            />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-label="Your email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-[13px] border border-line bg-bg2 px-4 text-sm text-tx outline-none placeholder:text-faint focus:[border-color:var(--accent)]"
            />
          </div>
          <textarea
            rows={4}
            required
            aria-label="Your message"
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mb-3.5 w-full resize-y rounded-[13px] border border-line bg-bg2 px-4 py-3.5 text-sm text-tx outline-none placeholder:text-faint focus:[border-color:var(--accent)]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12.5px] text-faint">
              {showEmail ? (
                <>
                  Or email{" "}
                  <a
                    href={`mailto:${EMAIL}`}
                    className="text-accent hover:underline"
                  >
                    {EMAIL}
                  </a>{" "}
                  · Twitter{" "}
                  <a
                    href={`https://x.com/${TWITTER}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    @{TWITTER}
                  </a>
                </>
              ) : (
                <>
                  Or reach us on Twitter{" "}
                  <a
                    href={`https://x.com/${TWITTER}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    @{TWITTER}
                  </a>
                </>
              )}
            </span>
            <Button type="submit" size="lg" className="gap-2">
              Send message
              <Send className="h-[15px] w-[15px]" strokeWidth={2.4} />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

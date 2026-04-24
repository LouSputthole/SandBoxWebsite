"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * "Copy link" button for the shareable page. Falls back gracefully if
 * the Web Share API isn't available (desktop Chrome, Firefox) — uses
 * navigator.clipboard instead. Some very old browsers have neither,
 * in which case we just do nothing and the button visually resets.
 */
export function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `https://sboxskins.gg/s/${slug}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // User cancelled the sheet — fall through to copy as a backup
        // behavior. Cancellation is not an error for our UX.
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard failures are silent on purpose — showing an error
        // popover here would be worse than doing nothing.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900/60 hover:border-purple-500/40 px-3 py-1.5 text-xs text-neutral-300 hover:text-white transition-colors"
      aria-label="Share this snapshot"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          Copied
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5" />
          Share
        </>
      )}
    </button>
  );
}

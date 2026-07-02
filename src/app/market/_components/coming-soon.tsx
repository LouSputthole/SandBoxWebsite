import Link from "next/link";
import { ShieldCheck, Coins, ArrowRight } from "lucide-react";

/**
 * Public holding page shown in place of the entire marketplace while it's gated
 * (MARKET_OPEN !== "true" and the visitor isn't an allowlisted/preview tester).
 * On-brand, no countdown, no email capture — just a clean takeover that points
 * people at the free trading board that's already live.
 */
export function ComingSoon() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium uppercase tracking-wide text-mut">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Coming soon
      </span>

      <h1 className="mt-6 font-display text-4xl font-semibold text-tx sm:text-5xl">
        The Marketplace is almost here
      </h1>

      <p className="mt-4 max-w-xl text-lg text-mut">
        A real-money marketplace for S&amp;box skins — buy &amp; sell for{" "}
        <span className="text-tx">USDC</span> with{" "}
        <span className="text-tx">escrow protection</span>. Coming soon.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-mut">
        <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
          <ShieldCheck className="h-4 w-4 text-accent" /> Escrow-protected
        </span>
        <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
          <Coins className="h-4 w-4 text-accent" /> USDC on Solana
        </span>
      </div>

      <Link
        href="/trade"
        className="mt-10 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        The free trading board is live now <ArrowRight className="h-4 w-4" />
      </Link>
    </main>
  );
}

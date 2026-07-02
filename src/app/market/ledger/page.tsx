import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, ScrollText, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatUsdc } from "@/lib/market/fees";
import { ledgerEntriesForIds } from "@/lib/market/ledger-query";
import { LedgerCard } from "./_components/ledger-card";

// Public page, but kept out of Google like the rest of /market (the crypto marketplace stays
// unindexed to protect the tracker's index). Rendered per-request — settlements land continuously
// and the proof chain must always be current (no stale cache on a trust page).
export const metadata: Metadata = {
  title: "Public Trust Ledger — sboxskins Marketplace",
  description:
    "Every completed marketplace trade as an on-chain proof chain: escrow funded, Steam trade delivered, vault paid out — with the explorer links to verify each step yourself.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function LedgerPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  // Headline stats reflect SUCCESSFUL trades (RELEASED = money actually moved to a seller). Refunds
  // are shown in the list for transparency but aren't "trades" or "volume". Fee revenue is never
  // surfaced (marketing rule). `total` (both terminal states) drives pagination.
  const [releasedCount, volumeAgg, monthCount, total, ordered] = await Promise.all([
    prisma.marketOrder.count({ where: { state: "RELEASED" } }),
    prisma.marketOrder.aggregate({ where: { state: "RELEASED" }, _sum: { priceUsdc: true } }),
    prisma.marketOrder.count({ where: { state: "RELEASED", releasedAt: { gte: monthStart } } }),
    prisma.marketOrder.count({ where: { state: { in: ["RELEASED", "REFUNDED"] } } }),
    // Order by actual completion time (COALESCE(releasedAt, refundedAt)) so releases and refunds
    // interleave newest-first. Prisma can't COALESCE in orderBy and a multi-key orderBy would
    // separate the two states, so order the ids in raw SQL, then hydrate with the include below.
    prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "MarketOrder"
      WHERE "state" IN ('RELEASED', 'REFUNDED')
      ORDER BY COALESCE("releasedAt", "refundedAt") DESC NULLS LAST
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const volume = volumeAgg._sum.priceUsdc ?? BigInt(0);

  // Hydrate the raw-SQL-ordered ids into privacy-honoring proof chains (shared with profiles).
  const entries = await ledgerEntriesForIds(ordered.map((r) => r.id));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/market" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mut hover:text-tx">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2.5 font-display text-3xl font-semibold text-tx">
          <ScrollText className="h-7 w-7 text-accent" /> Public trust ledger
        </h1>
        <p className="mt-2 max-w-2xl text-mut">
          Every completed trade, end to end: the buyer funds an on-chain escrow vault, the skin is
          delivered on Steam, and the vault pays out — <span className="text-tx">with the links to
          verify each step yourself</span>. Traders can hide their Steam name; the money and the chain
          stay public.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Trades settled" value={releasedCount.toLocaleString()} />
          <Stat label="Volume traded" value={`$${formatUsdc(volume)}`} accent />
          <Stat label="This month" value={monthCount.toLocaleString()} />
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel/50 px-6 py-16 text-center">
          <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-faint/60" />
          <p className="text-tx">No completed trades yet.</p>
          <p className="mt-1 text-sm text-mut">The ledger fills as trades settle — every one a verifiable proof chain.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((e) => (
            <LedgerCard key={e.id} entry={e} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-3">
          <PageLink page={page - 1} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </PageLink>
          <span className="font-mono text-[13px] text-mut">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages}>
            Next <ChevronRight className="h-4 w-4" />
          </PageLink>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-xl font-semibold ${accent ? "text-accent" : "text-tx"}`}>{value}</p>
    </div>
  );
}

/** Prev/Next link preserving nothing but ?page (the ledger has no other filters). */
function PageLink({ page, disabled, children }: { page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-[11px] border border-line px-4 text-[13px] font-semibold text-faint opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={`/market/ledger${page > 1 ? `?page=${page}` : ""}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-line bg-panel px-4 text-[13px] font-semibold text-tx transition-colors hover:bg-bg2"
    >
      {children}
    </Link>
  );
}

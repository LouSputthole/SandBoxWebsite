import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ScrollText, ShieldCheck, Store, Star as StarIcon, User as UserIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { getActiveListings } from "@/lib/market/listing-service";
import { loadProfileStats } from "@/lib/market/profile-service";
import { selectVisibleTrades, formatDuration } from "@/lib/market/profile-stats";
import { ledgerEntriesForIds } from "@/lib/market/ledger-query";
import { formatRelativeTime } from "@/lib/utils";
import { Stars } from "@/components/market/stars";
import { MarketListingCard } from "../../_components/listing-card";
import { LedgerCard } from "../../ledger/_components/ledger-card";

// Public page, but noindex like all of /market (the crypto marketplace stays out of Google).
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TRADES_WINDOW = 30; // most-recent terminal trades to consider; up to 10 visible are shown.

export default async function ProfilePage({ params }: { params: Promise<{ steamId: string }> }) {
  const { steamId } = await params;
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { id: true, username: true, avatarUrl: true, steamId: true, createdAt: true },
  });
  if (!user) notFound();

  const persona = user.username ?? "Anonymous trader";

  // Latest terminal trades for this user, ordered by completion time. Pull only the flag fields the
  // privacy rule needs; hydrate just the visible ones into full ledger proof chains.
  const recent = await prisma.$queryRaw<
    { id: string; buyerId: string; sellerId: string; buyerPublic: boolean; sellerPublic: boolean }[]
  >`
    SELECT "id", "buyerId", "sellerId", "buyerPublic", "sellerPublic" FROM "MarketOrder"
    WHERE "state" IN ('RELEASED', 'REFUNDED') AND ("buyerId" = ${user.id} OR "sellerId" = ${user.id})
    ORDER BY COALESCE("releasedAt", "refundedAt") DESC NULLS LAST
    LIMIT ${TRADES_WINDOW}
  `;
  const { visible, hiddenCount } = selectVisibleTrades(recent, user.id);

  const [stats, listings, tradeEntries, reviews] = await Promise.all([
    loadProfileStats(user.id),
    getActiveListings({ sellerId: user.id, take: 12 }),
    ledgerEntriesForIds(visible.slice(0, 10).map((o) => o.id)),
    prisma.marketReview.findMany({
      where: { ratedId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        stars: true,
        comment: true,
        createdAt: true,
        rater: { select: { username: true, avatarUrl: true, steamId: true } },
      },
    }),
  ]);

  const { asSeller, asBuyer, ratings } = stats;
  const completionPct = asSeller.completionRate === null ? null : Math.round(asSeller.completionRate * 100);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/market" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mut hover:text-tx">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>

      {/* header */}
      <header className="flex flex-wrap items-start gap-4">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Steam avatar host isn't in next/image config
          <img
            src={user.avatarUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-2xl border border-line object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-line bg-panel">
            <UserIcon className="h-7 w-7 text-mut" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-tx">{persona}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mut">
            <span>Member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
            <a
              href={`https://steamcommunity.com/profiles/${user.steamId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Steam profile <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {/* rating headline */}
          <div className="mt-2 flex items-center gap-2">
            {ratings.count > 0 && ratings.average !== null ? (
              <>
                <Stars value={ratings.average} size={16} />
                <span className="text-sm font-semibold text-tx">{ratings.average.toFixed(1)}</span>
                <span className="text-sm text-mut">
                  ({ratings.count} {ratings.count === 1 ? "review" : "reviews"})
                </span>
              </>
            ) : (
              <span className="text-sm text-mut">No reviews yet</span>
            )}
          </div>
        </div>
      </header>

      {/* seller stat strip */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Completed sales" value={asSeller.completedSales.toLocaleString()} />
        <StatTile label="Completion rate" value={completionPct === null ? "—" : `${completionPct}%`} />
        <StatTile
          label="Avg response"
          value={asSeller.avgResponseSeconds === null ? "—" : formatDuration(asSeller.avgResponseSeconds)}
        />
        <StatTile
          label="Avg delivery"
          value={asSeller.avgDeliverySeconds === null ? "—" : formatDuration(asSeller.avgDeliverySeconds)}
        />
        <StatTile label="Total volume" value={`$${asSeller.totalSalesVolumeFormatted}`} accent />
      </section>

      {/* buyer line (smaller) */}
      <p className="mt-3 text-xs text-faint">
        As a buyer: {asBuyer.completedPurchases.toLocaleString()}{" "}
        {asBuyer.completedPurchases === 1 ? "purchase" : "purchases"} · ${asBuyer.purchaseVolumeFormatted} spent
      </p>

      {/* stall */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-tx">
          <Store className="h-5 w-5 text-accent" /> Stall
          <span className="text-sm font-normal text-mut">({listings.length} active)</span>
        </h2>
        {listings.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line bg-panel/50 px-4 py-8 text-center text-sm text-mut">
            No active listings.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((listing) => (
              <MarketListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      {/* recent trades */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-tx">
          <ScrollText className="h-5 w-5 text-accent" /> Recent trades
        </h2>
        {tradeEntries.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line bg-panel/50 px-4 py-8 text-center text-sm text-mut">
            {hiddenCount > 0 ? "This trader keeps their history private." : "No completed trades yet."}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {tradeEntries.map((e) => (
              <LedgerCard key={e.id} entry={e} />
            ))}
          </div>
        )}
        {hiddenCount > 0 ? (
          <p className="mt-3 text-xs text-faint">
            {hiddenCount} {hiddenCount === 1 ? "trade" : "trades"} hidden by this trader.
          </p>
        ) : null}
      </section>

      {/* reviews */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-tx">
          <StarIcon className="h-5 w-5 text-accent" /> Reviews
          {ratings.count > 0 ? <span className="text-sm font-normal text-mut">({ratings.count})</span> : null}
        </h2>
        {reviews.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-line bg-panel/50 px-4 py-8 text-center">
            <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-faint/60" />
            <p className="text-sm text-mut">No reviews yet. Reviews come from buyers after a completed trade.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <Reviewer
                    steamId={r.rater.steamId}
                    username={r.rater.username}
                    avatarUrl={r.rater.avatarUrl}
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    <Stars value={r.stars} />
                    <span className="text-xs text-faint">{formatRelativeTime(r.createdAt)}</span>
                  </div>
                </div>
                {r.comment ? <p className="mt-2 whitespace-pre-wrap text-sm text-mut">{r.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-xl font-semibold ${accent ? "text-accent" : "text-tx"}`}>{value}</p>
    </div>
  );
}

/** Reviews are voluntarily public — always show the rater's Steam persona (links to their profile). */
function Reviewer({
  steamId,
  username,
  avatarUrl,
}: {
  steamId: string;
  username: string | null;
  avatarUrl: string | null;
}) {
  return (
    <Link href={`/market/u/${steamId}`} className="inline-flex items-center gap-2 font-medium text-tx hover:text-accent">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Steam avatar host isn't in next/image config
        <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full border border-line object-cover" />
      ) : (
        <UserIcon className="h-6 w-6 rounded-full border border-line p-1 text-mut" />
      )}
      {username ?? "Anonymous trader"}
    </Link>
  );
}

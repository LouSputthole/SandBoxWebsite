import Link from "next/link";
import { ExternalLink, Wallet, ShieldCheck, User as UserIcon } from "lucide-react";
import { SkinTile } from "@/components/items/skin-tile";
import { rarityCssColor } from "@/lib/rarity";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/market/explorer";
import type { LedgerEntry, LedgerParty } from "@/lib/market/ledger";

function fmt(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

/** Truncated middle for a base58 address (the chain is public, but the full string is noise). */
function truncateAddr(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 5)}…${addr.slice(-5)}`;
}

/** A small on-chain-verify link (address or tx) — the whole point of the ledger. */
function ChainLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-line bg-bg2 px-2 py-0.5 text-[11px] font-medium text-accent hover:border-accent"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/** Buyer/seller identity chip — links to their public profile when they've chosen to be visible;
 *  otherwise an anonymous mark. (The steamcommunity link lives on the profile page header.) */
function Party({ party }: { party: LedgerParty }) {
  if (party.public && party.persona && party.steamId) {
    return (
      <Link
        href={`/market/u/${party.steamId}`}
        className="inline-flex items-center gap-1.5 font-medium text-tx hover:text-accent"
      >
        {party.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Steam avatar host isn't in next/image config
          <img src={party.avatarUrl} alt="" className="h-[18px] w-[18px] rounded-full border border-line object-cover" />
        ) : (
          <UserIcon className="h-[18px] w-[18px] rounded-full border border-line p-0.5 text-mut" />
        )}
        {party.persona}
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-mut">
      <UserIcon className="h-[18px] w-[18px] rounded-full border border-line p-0.5 text-faint" />
      Anonymous
    </span>
  );
}

/** Wallet address, truncated, with an explorer link (always shown — the chain is public). */
function WalletRef({ address }: { address: string | null }) {
  if (!address) return null;
  return (
    <a
      href={explorerAddressUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[11px] text-faint hover:text-accent"
      title={address}
    >
      <Wallet className="h-3 w-3" /> {truncateAddr(address)}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

/** One proof-chain step row: a bullet, the narrative, and its on-chain links. */
function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-5">
      <span className="absolute left-0 top-[6px] h-2 w-2 rounded-full bg-accent/70 ring-2 ring-accent/20" />
      <div className="space-y-1 text-sm text-mut">{children}</div>
    </li>
  );
}

export function LedgerCard({ entry }: { entry: LedgerEntry }) {
  const released = entry.state === "RELEASED";

  return (
    <article className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
      {/* header: item + amount + state */}
      <div className="flex items-start gap-3">
        <Link href={`/items/${entry.item.slug}`} className="w-14 shrink-0 sm:w-16">
          <SkinTile
            imageUrl={entry.item.imageUrl}
            name={entry.item.name}
            type={entry.item.type}
            rarityColor={rarityCssColor(entry.item.rarityColor)}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/items/${entry.item.slug}`}
              className="truncate font-display text-base font-semibold text-tx hover:text-accent"
            >
              {entry.item.name}
            </Link>
            <span
              className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                released ? "border-up/40 bg-up/10 text-up" : "border-down/40 bg-down/10 text-down"
              }`}
            >
              {released ? "RELEASED" : "REFUNDED"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-mut">
            <span className="font-semibold text-tx">${entry.amountFormatted}</span> USDC
            {entry.completedAt ? <span className="text-faint"> · {fmt(entry.completedAt)}</span> : null}
          </p>
        </div>
      </div>

      {/* proof chain */}
      <ol className="mt-4 space-y-3 border-l border-line/60 pl-0">
        {/* 1 — funded */}
        <Step>
          <p>
            <Party party={entry.buyer} /> funded escrow of{" "}
            <span className="font-medium text-tx">${entry.amountFormatted} USDC</span>
            {entry.funded.at ? <span className="text-faint"> · {fmt(entry.funded.at)}</span> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <WalletRef address={entry.buyer.wallet} />
            {entry.escrowPda ? <ChainLink href={explorerAddressUrl(entry.escrowPda)} label="escrow vault" /> : null}
            {entry.funded.txSig ? <ChainLink href={explorerTxUrl(entry.funded.txSig)} label="funding tx" /> : null}
          </div>
        </Step>

        {/* 2 — delivered (RELEASED only) */}
        {entry.delivered ? (
          <Step>
            <p>
              Steam trade delivered
              {entry.delivered.deliveredAt ? (
                <span className="text-faint"> · {fmt(entry.delivered.deliveredAt)}</span>
              ) : entry.delivered.sellerSentAt ? (
                <span className="text-faint"> · sent {fmt(entry.delivered.sellerSentAt)}</span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {entry.delivered.idsVisible ? (
                <>
                  {entry.delivered.tradeOfferId ? (
                    <span className="font-mono text-faint">offer {entry.delivered.tradeOfferId}</span>
                  ) : null}
                  {entry.delivered.deliveredAssetId ? (
                    <span className="font-mono text-faint">asset {entry.delivered.deliveredAssetId}</span>
                  ) : null}
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-faint">
                  <ShieldCheck className="h-3 w-3 text-up" /> verified by oracle
                </span>
              )}
              {entry.delivered.txSig ? (
                <ChainLink href={explorerTxUrl(entry.delivered.txSig)} label="verification tx" />
              ) : null}
            </div>
          </Step>
        ) : null}

        {/* 3 — settled */}
        <Step>
          {released ? (
            <p>
              Vault paid <Party party={entry.seller} />
              {entry.settled.at ? <span className="text-faint"> · {fmt(entry.settled.at)}</span> : null}
            </p>
          ) : (
            <p>
              Buyer refunded in full
              {entry.settled.at ? <span className="text-faint"> · {fmt(entry.settled.at)}</span> : null}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {released ? <WalletRef address={entry.seller.wallet} /> : <WalletRef address={entry.buyer.wallet} />}
            {entry.settled.txSig ? (
              <ChainLink href={explorerTxUrl(entry.settled.txSig)} label={released ? "payout tx" : "refund tx"} />
            ) : null}
          </div>
        </Step>
      </ol>
    </article>
  );
}

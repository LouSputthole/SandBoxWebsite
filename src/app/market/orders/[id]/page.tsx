import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, Circle, Clock, ExternalLink, ScrollText, User as UserIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { SkinTile } from "@/components/items/skin-tile";
import { rarityCssColor } from "@/lib/rarity";
import { OrderActions } from "./order-actions";
import { PrivacyToggle } from "./privacy-toggle";
import { RateSeller } from "./rate-seller";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATE_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Awaiting payment", color: "var(--mut)" },
  FUNDING: { label: "Confirming payment", color: "var(--cat-tool)" },
  FUNDED: { label: "Awaiting delivery", color: "var(--cat-tool)" },
  PROTECTION_HOLD: { label: "Delivered — in protection window", color: "var(--accent)" },
  RELEASED: { label: "Complete", color: "var(--up)" },
  REFUNDED: { label: "Refunded", color: "var(--mut)" },
  DISPUTED: { label: "Disputed — under review", color: "var(--down)" },
};

function fmt(d: Date | null): string | null {
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/api/auth/steam?next=${encodeURIComponent(`/market/orders/${id}`)}`);

  const order = await prisma.marketOrder.findUnique({
    where: { id },
    include: {
      listing: { include: { item: true } },
      review: { select: { stars: true, comment: true } },
      buyer: { select: { username: true, avatarUrl: true, steamId: true } },
      seller: { select: { username: true, avatarUrl: true, steamId: true } },
    },
  });
  if (!order || (order.buyerId !== user.id && order.sellerId !== user.id)) notFound();

  const isSeller = order.sellerId === user.id;
  const item = order.listing.item;
  const meta = STATE_META[order.state] ?? { label: order.state, color: "var(--mut)" };
  const isCompleted = order.state === "RELEASED" || order.state === "REFUNDED";
  const myPublic = isSeller ? order.sellerPublic : order.buyerPublic;

  // The other party, shown to you with a link to their public profile IF they've chosen to be public.
  const counterparty = isSeller
    ? { ...order.buyer, label: "Buyer", isPublic: order.buyerPublic }
    : { ...order.seller, label: "Seller", isPublic: order.sellerPublic };

  // FUNDING = the buyer's payment tx is confirming on-chain — still pre-escrow, shown as active.
  const preFunded = order.state === "PENDING" || order.state === "FUNDING";
  const steps = [
    { label: "Payment escrowed", at: fmt(order.fundedAt), done: !preFunded, active: preFunded },
    { label: "Seller sent the trade", at: fmt(order.sellerSentAt), done: !!order.sellerSentAt },
    { label: "Item delivered", at: fmt(order.deliveredAt), done: !!order.deliveredAt },
    {
      label:
        order.state === "PROTECTION_HOLD" && order.protectionUntil
          ? `Protection window — payout ${fmt(order.protectionUntil)}`
          : "Protection window",
      at: null,
      done: !!order.releasedAt,
      active: order.state === "PROTECTION_HOLD",
    },
    {
      label: order.state === "REFUNDED" ? "Refunded to buyer" : "Seller paid out",
      at: fmt(order.releasedAt ?? order.refundedAt),
      done: !!(order.releasedAt || order.refundedAt),
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/market" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mut hover:text-tx">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>

      <div className="flex items-start gap-4">
        <SkinTile
          imageUrl={item.imageUrl}
          name={item.name}
          type={item.type}
          rarityColor={rarityCssColor(item.rarityColor)}
          className="w-24 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-tx">{item.name}</h1>
          <p className="mt-1 text-sm text-mut">
            ${order.listing.priceUsd.toFixed(2)} · you are the {isSeller ? "seller" : "buyer"}
          </p>
          <span
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
          >
            {meta.label}
          </span>
          <div className="mt-2 text-sm text-mut">
            {counterparty.label}:{" "}
            {counterparty.isPublic && counterparty.steamId ? (
              <Link
                href={`/market/u/${counterparty.steamId}`}
                className="inline-flex items-center gap-1 font-medium text-tx hover:text-accent"
              >
                {counterparty.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Steam avatar host isn't in next/image config
                  <img src={counterparty.avatarUrl} alt="" className="h-4 w-4 rounded-full border border-line object-cover" />
                ) : null}
                {counterparty.username ?? "view profile"}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-mut">
                <UserIcon className="h-3.5 w-3.5" /> Anonymous
              </span>
            )}
          </div>
        </div>
      </div>

      <ol className="mt-8 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5">
              {s.done ? (
                <Check className="h-5 w-5 text-up" />
              ) : s.active ? (
                <Clock className="h-5 w-5 text-accent" />
              ) : (
                <Circle className="h-5 w-5 text-faint" />
              )}
            </span>
            <div>
              <div className={s.done || s.active ? "text-sm text-tx" : "text-sm text-mut"}>{s.label}</div>
              {s.at ? <div className="text-xs text-faint">{s.at}</div> : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <OrderActions orderId={order.id} state={order.state} isSeller={isSeller} />
      </div>

      {/* Buyer rates the seller once the order is complete (RELEASED). One review per order. */}
      {order.state === "RELEASED" && !isSeller ? (
        <div className="mt-6">
          <RateSeller orderId={order.id} existing={order.review} />
        </div>
      ) : null}

      {isCompleted ? (
        <Link
          href="/market/ledger"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ScrollText className="h-4 w-4" /> View on the public ledger
        </Link>
      ) : null}

      <div className="mt-6">
        <PrivacyToggle orderId={order.id} initialPublic={myPublic} />
      </div>
    </main>
  );
}

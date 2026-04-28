import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Bitcoin,
  Bot,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isEscrowEnabled } from "@/lib/escrow/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Escrow trade",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATE_COPY: Record<
  string,
  { label: string; tone: string; description: string }
> = {
  pending_deposit: {
    label: "Awaiting seller",
    tone: "text-amber-300 border-amber-500/30 bg-amber-500/10",
    description:
      "The bot is asking the seller to deposit the items. Once they accept, you'll be prompted to pay.",
  },
  awaiting_payment: {
    label: "Awaiting payment",
    tone: "text-purple-300 border-purple-500/40 bg-purple-500/10",
    description:
      "Seller deposited the items. Pay via the Coinbase Commerce link below to release them to your inventory.",
  },
  payment_confirmed: {
    label: "Payment confirmed — releasing",
    tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    description:
      "Payment cleared. The bot is sending the items to your trade URL — accept the offer in Steam to complete.",
  },
  completed: {
    label: "Completed",
    tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    description: "Items delivered, payment settled. Trade closed.",
  },
  disputed: {
    label: "In dispute",
    tone: "text-red-300 border-red-500/40 bg-red-500/10",
    description:
      "Manual review in progress. We'll reach out via the email or contact info on your Steam profile.",
  },
  refunded: {
    label: "Refunded",
    tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40",
    description: "Payment returned to your originating wallet.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40",
    description: "Trade closed without completion.",
  },
};

export default async function EscrowTradePage({ params }: PageProps) {
  if (!isEscrowEnabled()) {
    redirect("/trade");
  }

  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/api/auth/steam?next=${encodeURIComponent(`/trade/escrow/${id}`)}`,
    );
  }

  const trade = await prisma.escrowTrade.findUnique({
    where: { id },
    include: {
      payment: true,
      seller: { select: { username: true, steamId: true } },
      buyer: { select: { username: true, steamId: true } },
      botAccount: { select: { label: true } },
      listing: { select: { description: true } },
    },
  });

  if (!trade) notFound();
  const isParty = trade.buyerId === user.id || trade.sellerId === user.id;
  if (!isParty) notFound();

  const role = trade.buyerId === user.id ? "buyer" : "seller";
  const state = STATE_COPY[trade.state] ?? {
    label: trade.state,
    tone: "text-neutral-300 border-neutral-700 bg-neutral-800/40",
    description: "",
  };

  const itemSnapshot = trade.itemSnapshot as {
    offering?: Array<{ name: string; quantity: number; slug: string | null }>;
  };
  const items = itemSnapshot.offering ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/trade"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trading board
      </Link>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Bitcoin className="h-4 w-4 text-orange-400" />
              <h1 className="text-lg font-bold text-white">Escrow trade</h1>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 font-mono">
              {trade.id}
            </p>
          </div>
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold border ${state.tone}`}
          >
            {state.label}
          </span>
        </div>

        <p className="text-sm text-neutral-300 leading-relaxed">
          {state.description}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Total" value={`$${trade.priceUsd.toFixed(2)}`} />
        <Stat label="Fee" value={`$${trade.feeUsd.toFixed(2)}`} />
        <Stat label="Role" value={role === "buyer" ? "You're buying" : "You're selling"} />
        <Stat
          label="Bot"
          value={trade.botAccount?.label ?? "—"}
          icon={<Bot className="h-3 w-3 text-neutral-500" />}
        />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 mb-4">
        <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
          Items
        </p>
        <ul className="space-y-1">
          {items.map((it, idx) => (
            <li
              key={`${it.slug ?? "x"}-${idx}`}
              className="text-sm text-white flex items-center justify-between"
            >
              {it.slug ? (
                <Link
                  href={`/items/${it.slug}`}
                  className="hover:text-purple-300 transition-colors"
                >
                  {it.name}
                </Link>
              ) : (
                <span>{it.name}</span>
              )}
              <span className="text-neutral-500 text-xs">
                {it.quantity > 1 ? `× ${it.quantity}` : "× 1"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {role === "buyer" && trade.state === "awaiting_payment" && trade.payment?.hostedUrl && (
        <a
          href={trade.payment.hostedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-center py-3 font-semibold text-sm mb-4"
        >
          Pay {`$${trade.priceUsd.toFixed(2)}`} via Coinbase Commerce →
        </a>
      )}

      {trade.state === "pending_deposit" && (
        <DeadlineNote
          icon={<Clock className="h-3.5 w-3.5 text-amber-300" />}
          text={`Seller has until ${trade.depositDeadline.toLocaleString()} to deposit. If they don't, the trade auto-cancels.`}
        />
      )}
      {trade.state === "awaiting_payment" && trade.paymentDeadline && (
        <DeadlineNote
          icon={<Clock className="h-3.5 w-3.5 text-amber-300" />}
          text={`Pay before ${trade.paymentDeadline.toLocaleString()} or the items return to the seller.`}
        />
      )}
      {trade.state === "completed" && (
        <DeadlineNote
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
          text="Trade complete. The seller payout is processed manually within 1-2 business days."
        />
      )}
      {trade.state === "disputed" && (
        <DeadlineNote
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-300" />}
          text="A dispute has been opened. Reach out to support via the contact link in the footer if you want to add details."
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-white tabular-nums">
        {value}
      </div>
    </div>
  );
}

function DeadlineNote({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 inline-flex items-start gap-2 text-xs text-neutral-400">
      {icon}
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

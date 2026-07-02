import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { SellForm } from "./sell-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/api/auth/steam?next=${encodeURIComponent("/market/sell")}`);

  const [wallet, credential, catalog] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId: user.id } }),
    prisma.sellerSteamCredential.findUnique({ where: { userId: user.id } }),
    prisma.item.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/market" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mut hover:text-tx">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>
      <h1 className="font-display text-3xl font-semibold text-tx">List a skin</h1>
      <p className="mt-1 text-mut">
        Sell for USDC on Solana. You keep the skin until it sells; escrow protects the buyer.
      </p>

      <SellForm
        hasWallet={!!wallet}
        hasKey={!!credential?.mobileAuthConfirmed}
        catalog={catalog}
      />
    </main>
  );
}

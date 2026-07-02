import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { assertNotBanned, MarketBannedError } from "@/lib/market/bans";

export const dynamic = "force-dynamic";

// A Solana base58 address is 32–44 chars of the base58 alphabet.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** POST /api/market/wallet — link/replace the caller's Solana wallet. Body: { address }. */
export async function POST(request: NextRequest) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const address = body.address?.trim();
  if (!address || !BASE58.test(address)) {
    return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
  }

  // Ban gate — a banned Steam id can't attach a fresh wallet, and a banned wallet can't be attached to
  // any account. Blocks evasion before the identifier ever touches the money path. TOS enforcement.
  try {
    await assertNotBanned({ steamId: user.steamId, walletAddress: address });
  } catch (err) {
    if (err instanceof MarketBannedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const wallet = await prisma.userWallet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, address },
    update: { address },
  });
  return NextResponse.json({ wallet: { address: wallet.address } });
}

/** GET /api/market/wallet — the caller's linked wallet, if any. */
export async function GET() {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ wallet: wallet ? { address: wallet.address } : null });
}

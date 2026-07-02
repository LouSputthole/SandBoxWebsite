import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { encryptSecret } from "@/lib/market/steam-credential";

export const dynamic = "force-dynamic";

// A Steam Web API key is 32 hex characters.
const STEAM_API_KEY = /^[0-9A-Fa-f]{32}$/;

/**
 * POST /api/market/steam-key — link/replace the seller's Steam Web API key (encrypted at rest)
 * and confirm Mobile Authenticator. Body: { apiKey, mobileAuthConfirmed }.
 */
export async function POST(request: NextRequest) {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { apiKey?: string; mobileAuthConfirmed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const apiKey = body.apiKey?.trim();
  if (!apiKey || !STEAM_API_KEY.test(apiKey)) {
    return NextResponse.json({ error: "Enter a valid 32-character Steam Web API key" }, { status: 400 });
  }
  if (!body.mobileAuthConfirmed) {
    return NextResponse.json(
      { error: "Confirm Steam Guard Mobile Authenticator is enabled (required to avoid trade holds)" },
      { status: 400 },
    );
  }

  let enc;
  try {
    enc = encryptSecret(apiKey);
  } catch {
    // MARKET_CREDENTIAL_KEY missing/misconfigured — an operator problem, not the user's.
    return NextResponse.json({ error: "Server key store is not configured" }, { status: 500 });
  }

  await prisma.sellerSteamCredential.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      encryptedApiKey: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      mobileAuthConfirmed: true,
    },
    update: {
      encryptedApiKey: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      mobileAuthConfirmed: true,
    },
  });
  return NextResponse.json({ ok: true });
}

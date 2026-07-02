import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { createBan, liftBan, listBans } from "@/lib/market/bans";

export const dynamic = "force-dynamic";

/** A MarketBan row (dates → ISO) for the admin dashboard. Reason IS shown here — admin-only. */
function serializeBan(b: {
  id: string;
  steamId: string | null;
  walletAddress: string | null;
  reason: string;
  bannedByKeyType: string;
  orderId: string | null;
  createdAt: Date;
  liftedAt: Date | null;
}) {
  return {
    id: b.id,
    steamId: b.steamId,
    walletAddress: b.walletAddress,
    reason: b.reason,
    bannedByKeyType: b.bannedByKeyType,
    orderId: b.orderId,
    createdAt: b.createdAt.toISOString(),
    liftedAt: b.liftedAt ? b.liftedAt.toISOString() : null,
    active: b.liftedAt === null,
  };
}

/**
 * GET /api/admin/market/ban?all=1
 *
 * Active bans (steamId / wallet / reason / who / date). `?all=1` includes lifted bans (history).
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron", "analytics"] });
  if (!guard.ok) return guard.response;

  const all = request.nextUrl.searchParams.get("all") === "1";
  const bans = await listBans({ activeOnly: !all, take: 200 });
  return NextResponse.json({ bans: bans.map(serializeBan) });
}

/**
 * POST /api/admin/market/ban
 * Body: { action: "ban" | "lift", steamId?, walletAddress?, reason?, id?, orderId? }
 *
 *  - ban  → createBan (reason required; at least one identifier). `bannedByKeyType` is taken from the
 *           admin key that authenticated (guardAdminRoute → "analytics" | "cron"), never the client.
 *           Idempotent: re-banning an already-active identifier returns the existing ban.
 *  - lift → liftBan(id) (soft-lift; keeps history).
 *
 * Always returns the refreshed ACTIVE ban list, plus the affected `ban` on a ban action. Domain
 * errors (missing identifier / reason / invalid format) surface as 400 with the thrown message.
 */
export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron", "analytics"] });
  if (!guard.ok) return guard.response;

  let body: {
    action?: string;
    steamId?: string;
    walletAddress?: string;
    reason?: string;
    id?: string;
    orderId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "ban" && action !== "lift") {
    return NextResponse.json({ error: 'action must be "ban" or "lift"' }, { status: 400 });
  }

  try {
    if (action === "lift") {
      if (!body.id?.trim()) return NextResponse.json({ error: "a ban id is required to lift" }, { status: 400 });
      await liftBan(body.id.trim());
    } else {
      // createBan validates: at least one identifier, valid formats, non-empty reason.
      const ban = await createBan({
        steamId: body.steamId,
        walletAddress: body.walletAddress,
        reason: body.reason ?? "",
        bannedByKeyType: guard.keyType,
        orderId: body.orderId,
      });
      const bans = await listBans({ activeOnly: true, take: 200 });
      return NextResponse.json({ ban: serializeBan(ban), bans: bans.map(serializeBan) });
    }

    const bans = await listBans({ activeOnly: true, take: 200 });
    return NextResponse.json({ bans: bans.map(serializeBan) });
  } catch (err) {
    // Not-found lift (bad id) → Prisma P2025; treat as a 404. Everything else is a validation 400.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "ban not found" }, { status: 404 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "ban action failed" }, { status: 400 });
  }
}

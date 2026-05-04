import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { validateTradeUrlForSteamId, canonicalTradeUrl } from "@/lib/trade/url";

// Listing duration. User asked for ≥14d on 7d-or-less feeling stingy. We
// default to 14d, allow override up to 30d.
const DEFAULT_DURATION_DAYS = 14;
const MAX_DURATION_DAYS = 30;
// Per-user active listing cap to keep the feed signal-to-noise high and
// prevent one user from flooding the board.
const MAX_ACTIVE_LISTINGS_PER_USER = 5;
// Bound the line-item count so a single listing can't blow up the page.
const MAX_LINE_ITEMS = 30;

interface PostBody {
  side?: "selling" | "buying" | "both";
  description?: string;
  meetingPlace?: "steam_trade" | "trading_hub" | "either";
  durationDays?: number;
  // If the user hasn't set their trade URL yet (or wants to update it), they
  // can include it in the create call. Saved to User.steamTradeUrl.
  steamTradeUrl?: string;
  offering?: LineItemInput[];
  wanting?: LineItemInput[];
}

interface LineItemInput {
  itemId?: string; // catalog item
  customName?: string; // off-catalog (TF2 keys, Rust skins, cash, etc.)
  quantity?: number;
}

/**
 * GET /api/trade?side=&q=&page=
 *
 * Public feed of active trade listings, paginated 20/page. Filterable by
 * side and by item name (matches both catalog item names and customName
 * line items).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const side = url.searchParams.get("side"); // selling|buying|both|null
  const meeting = url.searchParams.get("meeting"); // steam_trade|trading_hub|either|null
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const PAGE_SIZE = 20;

  const where: Record<string, unknown> = { status: "active" };
  const andClauses: Record<string, unknown>[] = [];
  if (side === "selling" || side === "buying" || side === "both") {
    where.side = side;
  }
  // Steam-trade filter must include legacy null rows so pre-Phase B
  // listings keep matching it. Hub/either filters are exact.
  if (meeting === "steam_trade") {
    andClauses.push({
      OR: [{ meetingPlace: "steam_trade" }, { meetingPlace: null }],
    });
  } else if (meeting === "trading_hub" || meeting === "either") {
    where.meetingPlace = meeting;
  }
  if (q.length > 0) {
    // Match either an item name in the line-items, a customName, or the
    // listing description (covers users who write everything as text).
    andClauses.push({
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        {
          items: {
            some: {
              OR: [
                { customName: { contains: q, mode: "insensitive" } },
                { item: { name: { contains: q, mode: "insensitive" } } },
              ],
            },
          },
        },
      ],
    });
  }
  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  const [listings, total] = await Promise.all([
    prisma.tradeListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        user: {
          select: { steamId: true, username: true, avatarUrl: true },
        },
        items: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                type: true,
                currentPrice: true,
                lowestPrice: true,
              },
            },
          },
        },
      },
    }),
    prisma.tradeListing.count({ where }),
  ]);

  return NextResponse.json({
    listings,
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: page * PAGE_SIZE < total,
  });
}

/**
 * POST /api/trade — Create a new listing. Requires Steam login + a saved
 * trade URL (or one provided in this request).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // --- side ---
  if (body.side !== "selling" && body.side !== "buying" && body.side !== "both") {
    return NextResponse.json(
      { error: "side must be 'selling', 'buying', or 'both'" },
      { status: 400 },
    );
  }

  // --- description ---
  const description = (body.description ?? "").trim();
  if (description.length === 0) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (description.length > 1000) {
    return NextResponse.json(
      { error: "description max 1000 chars" },
      { status: 400 },
    );
  }

  // --- duration ---
  const durationDays = Math.min(
    MAX_DURATION_DAYS,
    Math.max(1, Math.round(body.durationDays ?? DEFAULT_DURATION_DAYS)),
  );

  // --- meetingPlace ---
  // Default to steam_trade for back-compat with clients that don't set
  // the field. Only the three known values are accepted; anything else
  // is a 400.
  const meetingPlace = body.meetingPlace ?? "steam_trade";
  if (
    meetingPlace !== "steam_trade" &&
    meetingPlace !== "trading_hub" &&
    meetingPlace !== "either"
  ) {
    return NextResponse.json(
      { error: "meetingPlace must be 'steam_trade', 'trading_hub', or 'either'" },
      { status: 400 },
    );
  }

  // --- trade URL ---
  // Required when the user wants Steam trades (steam_trade or either).
  // For trading_hub-only listings, the swap happens in-game — no trade
  // URL needed. Validate + canonicalize anything supplied regardless,
  // since users often paste it for later use.
  let tradeUrl = user.steamTradeUrl;
  if (body.steamTradeUrl) {
    const parsed = validateTradeUrlForSteamId(body.steamTradeUrl, user.steamId);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Invalid Steam trade URL. Make sure it's your own URL and includes the &token= part.",
        },
        { status: 400 },
      );
    }
    tradeUrl = canonicalTradeUrl(parsed);
    await prisma.user.update({
      where: { id: user.id },
      data: { steamTradeUrl: tradeUrl },
    });
  }
  const tradeUrlRequired = meetingPlace !== "trading_hub";
  if (tradeUrlRequired && !tradeUrl) {
    return NextResponse.json(
      {
        error:
          "Set your Steam trade URL first. Steam → Inventory → Trade Offers → 'Who can send me Trade Offers?' → copy the URL.",
        code: "NO_TRADE_URL",
      },
      { status: 400 },
    );
  }

  // --- line items ---
  const offering = Array.isArray(body.offering) ? body.offering : [];
  const wanting = Array.isArray(body.wanting) ? body.wanting : [];
  const totalItems = offering.length + wanting.length;
  if (totalItems > MAX_LINE_ITEMS) {
    return NextResponse.json(
      { error: `Too many line items (max ${MAX_LINE_ITEMS})` },
      { status: 400 },
    );
  }

  // Resolve catalog items so we can snapshot price-at-listing time
  const allItemIds = [...offering, ...wanting]
    .map((li) => li.itemId)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  const catalogItems =
    allItemIds.length > 0
      ? await prisma.item.findMany({
          where: { id: { in: allItemIds } },
          select: { id: true, currentPrice: true },
        })
      : [];
  const priceById = new Map(catalogItems.map((i) => [i.id, i.currentPrice]));
  const validIds = new Set(catalogItems.map((i) => i.id));

  function toLineRows(slot: "offering" | "wanting", arr: LineItemInput[]) {
    return arr
      .map((li) => {
        const qty = Math.min(99999, Math.max(1, Math.floor(li.quantity ?? 1)));
        if (li.itemId && validIds.has(li.itemId)) {
          return {
            slot,
            itemId: li.itemId,
            customName: null,
            quantity: qty,
            unitPriceAtListing: priceById.get(li.itemId) ?? null,
          };
        }
        const custom = (li.customName ?? "").trim();
        if (custom.length === 0) return null;
        if (custom.length > 100) return null;
        return {
          slot,
          itemId: null,
          customName: custom,
          quantity: qty,
          unitPriceAtListing: null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  const offeringRows = toLineRows("offering", offering);
  const wantingRows = toLineRows("wanting", wanting);

  if (
    offeringRows.length === 0 &&
    wantingRows.length === 0 &&
    description.length < 10
  ) {
    return NextResponse.json(
      {
        error:
          "Add at least one item or write a longer description (≥10 chars) so the listing has content.",
      },
      { status: 400 },
    );
  }

  // --- per-user active cap ---
  const activeCount = await prisma.tradeListing.count({
    where: { userId: user.id, status: "active" },
  });
  if (activeCount >= MAX_ACTIVE_LISTINGS_PER_USER) {
    return NextResponse.json(
      {
        error: `You already have ${activeCount} active listings (max ${MAX_ACTIVE_LISTINGS_PER_USER}). Cancel one first.`,
      },
      { status: 429 },
    );
  }

  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const created = await prisma.tradeListing.create({
    data: {
      userId: user.id,
      side: body.side,
      description,
      meetingPlace,
      expiresAt,
      items: {
        create: [...offeringRows, ...wantingRows],
      },
    },
    include: { items: true },
  });

  return NextResponse.json({ listing: created }, { status: 201 });
}

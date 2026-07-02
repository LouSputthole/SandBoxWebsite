import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { marketGate } from "@/lib/market/access-server";
import { fetchInventoryItems, InventoryPrivateError } from "@/lib/market/steam-inventory";

export const dynamic = "force-dynamic";

/** GET /api/market/inventory — the caller's listable S&box items (tradable + marketable only). */
export async function GET() {
  const gate = await marketGate();
  if (gate) return gate;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const items = await fetchInventoryItems(user.steamId);
    // Only tradable + marketable items can move through escrow.
    return NextResponse.json({ items: items.filter((i) => i.tradable && i.marketable) });
  } catch (err) {
    if (err instanceof InventoryPrivateError) {
      return NextResponse.json({ error: "Set your Steam inventory to public first" }, { status: 422 });
    }
    return NextResponse.json({ error: "Couldn't read your Steam inventory" }, { status: 502 });
  }
}

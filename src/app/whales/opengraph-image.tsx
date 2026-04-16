import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const alt = "S&box Skin Whales — Biggest Collectors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const items = await prisma.item.findMany({
    where: { topHolders: { not: Prisma.JsonNull } },
    select: { currentPrice: true, topHolders: true },
  });

  const byWhale = new Map<string, { name: string; total: number }>();
  for (const item of items) {
    if (!Array.isArray(item.topHolders)) continue;
    const price = item.currentPrice ?? 0;
    if (price <= 0) continue;
    for (const h of item.topHolders as unknown as Array<{ steamId: string; name: string; quantity: number }>) {
      if (!h.steamId) continue;
      const existing = byWhale.get(h.steamId) ?? { name: h.name, total: 0 };
      existing.total += price * h.quantity;
      byWhale.set(h.steamId, existing);
    }
  }

  const top5 = Array.from(byWhale.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

  const rankColors = ["#fbbf24", "#d4d4d4", "#fb923c", "#a78bfa", "#a78bfa"];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)",
          padding: "60px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
          <span style={{ fontSize: 32, color: "#a78bfa", fontWeight: 700 }}>sboxskins.gg</span>
          <span style={{ fontSize: 18, color: "#525252", textTransform: "uppercase", letterSpacing: "2px" }}>
            Whales
          </span>
        </div>

        <span style={{ fontSize: 48, fontWeight: 700, color: "white", marginBottom: "24px" }}>
          S&box Skin Whales 🐋
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
          {top5.map((h, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "20px",
                padding: "16px 24px",
                borderRadius: "14px",
                background: "#1a1a2e",
                border: "1px solid #2a2a3e",
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 700, color: rankColors[i], width: "50px" }}>
                #{i + 1}
              </span>
              <span style={{ fontSize: 28, fontWeight: 600, color: "white", flex: 1 }}>
                {h.name.length > 28 ? h.name.slice(0, 28) + "…" : h.name}
              </span>
              <span style={{ fontSize: 32, fontWeight: 700, color: "#4ade80" }}>
                {fmt(h.total)}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}

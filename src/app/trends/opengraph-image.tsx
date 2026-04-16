import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "S&box Market Trends";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const items = await prisma.item.findMany({
    select: { currentPrice: true, volume: true, totalSupply: true },
  });

  const listingsValue = items.reduce((s, i) => s + (i.currentPrice ?? 0) * (i.volume ?? 0), 0);
  const estCap = items
    .filter((i) => i.totalSupply && (i.currentPrice ?? 0) > 0)
    .reduce((s, i) => s + (i.currentPrice ?? 0) * (i.totalSupply ?? 0), 0);

  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
          <span style={{ fontSize: 32, color: "#a78bfa", fontWeight: 700 }}>sboxskins.gg</span>
          <span style={{ fontSize: 18, color: "#525252", textTransform: "uppercase", letterSpacing: "2px" }}>
            Market Trends
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1, justifyContent: "center" }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: "white", lineHeight: 1.1 }}>
            S&box Market Live
          </span>
          <span style={{ fontSize: 24, color: "#a0a0b0", maxWidth: "900px" }}>
            Tracking {items.length} skins on the Steam Community Market. Live prices, volume, top movers, scarcity.
          </span>
        </div>

        <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, padding: "20px 24px", borderRadius: "14px", background: "#1a1a2e", border: "1px solid #2a2a3e" }}>
            <span style={{ fontSize: 16, color: "#737373", textTransform: "uppercase", letterSpacing: "1px" }}>Est. Market Cap</span>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#a78bfa" }}>{fmt(estCap)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, padding: "20px 24px", borderRadius: "14px", background: "#1a1a2e", border: "1px solid #2a2a3e" }}>
            <span style={{ fontSize: 16, color: "#737373", textTransform: "uppercase", letterSpacing: "1px" }}>Listings Value</span>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#60a5fa" }}>{fmt(listingsValue)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, padding: "20px 24px", borderRadius: "14px", background: "#1a1a2e", border: "1px solid #2a2a3e" }}>
            <span style={{ fontSize: 16, color: "#737373", textTransform: "uppercase", letterSpacing: "1px" }}>Tracked Skins</span>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#4ade80" }}>{items.length}</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "S&box Skin Price";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const typeColors: Record<string, string> = {
  character: "#a78bfa",
  clothing: "#60a5fa",
  accessory: "#4ade80",
  weapon: "#f87171",
  tool: "#fbbf24",
};

export default async function OGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const item = await prisma.item.findFirst({
    where: { OR: [{ id: slug }, { slug }] },
  });

  if (!item) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#0a0a0f", color: "white", fontSize: 48 }}>
          Item Not Found
        </div>
      ),
      size
    );
  }

  const color = typeColors[item.type] || "#a78bfa";
  const price = item.currentPrice != null ? `$${item.currentPrice.toFixed(2)}` : "N/A";
  const change = item.priceChange24h ?? 0;
  const changeStr = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  const changeColor = change > 0 ? "#4ade80" : change < 0 ? "#f87171" : "#9ca3af";

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
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "40px" }}>
          <span style={{ fontSize: 28, color: "#a78bfa", fontWeight: 700 }}>sboxskins.gg</span>
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "60px" }}>
          {/* Icon placeholder */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "200px",
              height: "200px",
              borderRadius: "24px",
              background: `linear-gradient(135deg, ${color}22, ${color}11)`,
              border: `2px solid ${color}44`,
              fontSize: "80px",
              fontWeight: 700,
              color: `${color}88`,
            }}
          >
            {item.name.charAt(0)}
          </div>

          {/* Info */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <span style={{ color: "#737373", fontSize: 20, textTransform: "capitalize" }}>
              {item.type}
            </span>

            <span style={{ fontSize: 52, fontWeight: 700, color: "white" }}>
              {item.name}
            </span>

            <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
              <span style={{ fontSize: 48, fontWeight: 700, color: "white" }}>
                {price}
              </span>
              <span style={{ fontSize: 28, fontWeight: 600, color: changeColor }}>
                {changeStr}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
          <span style={{ fontSize: 20, color: "#525252" }}>
            Steam Community Market - S&box
          </span>
          <span style={{ fontSize: 20, color: "#525252" }}>
            Price Tracker & Market Data
          </span>
        </div>
      </div>
    ),
    size
  );
}

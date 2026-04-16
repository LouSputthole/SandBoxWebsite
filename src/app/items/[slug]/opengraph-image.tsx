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
  const scarcity = item.scarcityScore;

  const stats: { label: string; value: string }[] = [];
  if (item.totalSupply != null) stats.push({ label: "Supply", value: item.totalSupply.toLocaleString() });
  if (item.uniqueOwners != null) stats.push({ label: "Owners", value: item.uniqueOwners.toLocaleString() });
  if (item.soldPast24h != null) stats.push({ label: "Sold 24h", value: item.soldPast24h.toString() });
  if (scarcity != null) stats.push({ label: "Scarcity", value: `${scarcity.toFixed(0)}/100` });

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <span style={{ fontSize: 28, color: "#a78bfa", fontWeight: 700 }}>sboxskins.gg</span>
          <span style={{ fontSize: 18, color: "#525252", textTransform: "uppercase", letterSpacing: "1px" }}>
            {item.category ?? item.type}
            {item.itemSubType ? ` · ${item.itemSubType}` : ""}
          </span>
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "56px" }}>
          {/* Icon */}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
            <span style={{ fontSize: 48, fontWeight: 700, color: "white", lineHeight: 1.1 }}>
              {item.name}
            </span>

            <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginTop: "4px" }}>
              <span style={{ fontSize: 56, fontWeight: 700, color: "white" }}>
                {price}
              </span>
              <span style={{ fontSize: 28, fontWeight: 600, color: changeColor }}>
                {changeStr} 24h
              </span>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        {stats.length > 0 && (
          <div style={{ display: "flex", gap: "16px", marginTop: "20px" }}>
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  flex: 1,
                  padding: "16px 20px",
                  borderRadius: "12px",
                  background: "#1a1a2e",
                  border: "1px solid #2a2a3e",
                }}
              >
                <span style={{ fontSize: 14, color: "#737373", textTransform: "uppercase", letterSpacing: "1px" }}>
                  {s.label}
                </span>
                <span style={{ fontSize: 28, fontWeight: 700, color: "white" }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    size
  );
}

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "S&box skin snapshot on sboxskins.gg";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG image for /s/<slug>. This is what Twitter, Discord, Reddit, and
 * iMessage render when someone pastes a sboxskins.gg/s/<slug> link into
 * a chat/post. Satori doesn't run the React DOM, so we build the image
 * with plain flex div soup — no custom components.
 *
 * Design rules (learned the hard way from apple-icon.tsx):
 * - Avoid SVG stroke gradients; Satori renders them as invisible.
 * - Keep text large and high-contrast — these get viewed at thumbnail
 *   size in timelines.
 * - Make sure "sboxskins.gg" is legible after platform re-compression.
 */
export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await prisma.item.findFirst({
    where: { OR: [{ id: slug }, { slug }] },
    select: {
      name: true,
      slug: true,
      type: true,
      imageUrl: true,
      currentPrice: true,
      priceChange24h: true,
      totalSupply: true,
      uniqueOwners: true,
      scarcityScore: true,
    },
  });

  if (!item) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "#0a0a0f",
            color: "white",
            fontSize: 48,
          }}
        >
          sboxskins.gg
        </div>
      ),
      size,
    );
  }

  const price =
    item.currentPrice != null ? `$${item.currentPrice.toFixed(2)}` : "—";
  const change24h = item.priceChange24h;
  const changeStr =
    change24h != null
      ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%`
      : null;
  const changeColor = change24h != null && change24h < 0 ? "#f87171" : "#34d399";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0a0812 0%, #1a0a2e 55%, #2a1540 100%)",
          padding: "60px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header bar — branding anchor */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <span
            style={{
              fontSize: 32,
              color: "#c084fc",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            sboxskins.gg
          </span>
          <span
            style={{
              fontSize: 16,
              color: "#737373",
              textTransform: "uppercase",
              letterSpacing: "2px",
            }}
          >
            S&box · {item.type}
          </span>
        </div>

        {/* Body — image left, stats right */}
        <div style={{ display: "flex", flex: 1, gap: 40, alignItems: "center" }}>
          {item.imageUrl &&
          (item.imageUrl.startsWith("http://") ||
            item.imageUrl.startsWith("https://")) ? (
            <img
              src={item.imageUrl}
              alt=""
              width={320}
              height={320}
              style={{
                objectFit: "cover",
                borderRadius: 20,
                border: "1px solid rgba(168, 85, 247, 0.3)",
              }}
            />
          ) : (
            <div
              style={{
                width: 320,
                height: 320,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 20,
                background: "rgba(168, 85, 247, 0.1)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                fontSize: 80,
                color: "#c084fc",
                fontWeight: 900,
              }}
            >
              s&
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: "white",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                marginBottom: 16,
              }}
            >
              {item.name}
            </span>

            <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
              <span style={{ fontSize: 56, fontWeight: 800, color: "white" }}>
                {price}
              </span>
              {changeStr && (
                <span style={{ fontSize: 32, fontWeight: 700, color: changeColor }}>
                  {changeStr}
                </span>
              )}
            </div>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {item.totalSupply != null && (
                <span style={{ fontSize: 22, color: "#a0a0b0" }}>
                  {item.totalSupply.toLocaleString()} total supply
                </span>
              )}
              {item.uniqueOwners != null && (
                <span style={{ fontSize: 22, color: "#a0a0b0" }}>
                  {item.uniqueOwners.toLocaleString()} unique owners
                </span>
              )}
              {item.scarcityScore != null && (
                <span style={{ fontSize: 22, color: "#c084fc" }}>
                  Scarcity {item.scarcityScore.toFixed(0)}/100
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <span style={{ fontSize: 20, color: "#737373" }}>
            Live S&box market data · updated continuously
          </span>
          <span style={{ fontSize: 20, color: "#c084fc", fontWeight: 600 }}>
            sboxskins.gg/s/{item.slug}
          </span>
        </div>
      </div>
    ),
    size,
  );
}

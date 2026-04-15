import { ImageResponse } from "next/og";

export const alt = "sboxskins.gg — S&box Skin Prices & Market Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #0a0a0f 0%, #1a0a2e 50%, #0a0a0f 100%)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          padding: "80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            padding: "8px 20px",
            background: "rgba(168, 85, 247, 0.15)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            borderRadius: "999px",
            marginBottom: "40px",
            color: "#d8b4fe",
            fontSize: "24px",
          }}
        >
          Live S&amp;box Market Tracker
        </div>

        <div
          style={{
            fontSize: "96px",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            marginBottom: "28px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <span>sbox</span>
          <span
            style={{
              background: "linear-gradient(90deg, #c084fc 0%, #60a5fa 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            skins
          </span>
          <span style={{ color: "#9ca3af" }}>.gg</span>
        </div>

        <div
          style={{
            fontSize: "36px",
            color: "#d1d5db",
            maxWidth: "900px",
            lineHeight: 1.3,
            marginBottom: "48px",
          }}
        >
          Live prices, order books, supply & market trends for every S&amp;box skin
        </div>

        <div
          style={{
            display: "flex",
            gap: "48px",
            fontSize: "22px",
            color: "#9ca3af",
          }}
        >
          <span>Steam Market Data</span>
          <span style={{ color: "#4b5563" }}>•</span>
          <span>Order Books</span>
          <span style={{ color: "#4b5563" }}>•</span>
          <span>Total Supply</span>
          <span style={{ color: "#4b5563" }}>•</span>
          <span>Price Charts</span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

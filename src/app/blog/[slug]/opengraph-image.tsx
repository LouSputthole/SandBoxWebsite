import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "S&box Market Report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });

  if (!post) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#0a0a0f", color: "white", fontSize: 48 }}>
          sboxskins.gg
        </div>
      ),
      size,
    );
  }

  const dateStr = post.publishedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

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
          <span style={{ fontSize: 16, color: "#525252", textTransform: "uppercase", letterSpacing: "2px" }}>
            {post.kind ? post.kind.replace("-", " ") : "Article"} · {dateStr}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px", flex: 1, justifyContent: "center" }}>
          <span style={{ fontSize: 60, fontWeight: 700, color: "white", lineHeight: 1.1 }}>
            {post.title}
          </span>
          <span style={{ fontSize: 26, color: "#a0a0b0", lineHeight: 1.4, maxWidth: "1000px" }}>
            {post.excerpt}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: 20, color: "#737373" }}>
            Read the full report at sboxskins.gg/blog
          </span>
        </div>
      </div>
    ),
    size,
  );
}

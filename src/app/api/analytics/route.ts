import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

/**
 * POST /api/analytics — Record a page view.
 * Body: { path: string, referrer?: string }
 *
 * Extracts device/browser/OS from User-Agent.
 * Creates an anonymous session ID from hashed IP + UA (no cookies needed).
 */
export async function POST(request: NextRequest) {
  try {
    const { path, referrer } = (await request.json()) as {
      path?: string;
      referrer?: string;
    };

    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const ua = request.headers.get("user-agent") ?? "";
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    // Vercel geo headers
    const country = request.headers.get("x-vercel-ip-country") ?? null;
    const city = request.headers.get("x-vercel-ip-city") ?? null;

    // Parse device/browser/OS from UA
    const device = parseDevice(ua);
    const browser = parseBrowser(ua);
    const os = parseOS(ua);

    // Anonymous session: hash of IP + UA + date (rotates daily)
    const today = new Date().toISOString().slice(0, 10);
    const sessionId = createHash("sha256")
      .update(`${ip}:${ua}:${today}`)
      .digest("hex")
      .slice(0, 16);

    // Clean referrer — strip the current domain
    let cleanReferrer = referrer ?? null;
    if (cleanReferrer) {
      try {
        const refUrl = new URL(cleanReferrer);
        if (
          refUrl.hostname === "sboxskins.gg" ||
          refUrl.hostname.endsWith(".vercel.app")
        ) {
          cleanReferrer = null; // Internal navigation, not a real referrer
        } else {
          cleanReferrer = refUrl.hostname;
        }
      } catch {
        cleanReferrer = null;
      }
    }

    // Fire and forget — don't block the response on DB write
    prisma.pageView
      .create({
        data: {
          path,
          referrer: cleanReferrer,
          userAgent: ua.slice(0, 500),
          country,
          city,
          device,
          browser,
          os,
          sessionId,
        },
      })
      .catch((err) => console.error("[analytics] Failed to record:", err));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail the client
  }
}

function parseDevice(ua: string): string {
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod/i.test(ua)) return "mobile";
  return "desktop";
}

function parseBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/opera|opr/i.test(ua)) return "Opera";
  return "Other";
}

function parseOS(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua) && !/android/i.test(ua)) return "Linux";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  return "Other";
}

import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/admin/debug-sbox?slug=hard-hat
 *
 * Returns the raw sbox.dev per-skin response so we can see exactly
 * what fields they're returning — image URL, key names, nesting. Used
 * to diagnose "why isn't Hard Hat picking up an image" without having
 * to ssh into the production runtime. ANALYTICS_KEY-gated; harmless
 * read-only.
 *
 * Returns the JSON unchanged plus a hint of which keys look image-like
 * so the operator can copy the right one back to me.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug query param required (lowercase alnum + dashes)" },
      { status: 400 },
    );
  }

  let raw: unknown;
  let status: number | null = null;
  try {
    const res = await fetch(`https://api.sbox.dev/v1/skins/${slug}`, {
      signal: AbortSignal.timeout(10000),
    });
    status = res.status;
    raw = await res.json().catch(() => ({}));
  } catch (err) {
    return NextResponse.json(
      {
        error: "sbox.dev fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // Walk the response and report every string value that LOOKS like a
  // URL, with its key path. Lets the operator (or me, reading the
  // output) spot the icon URL and tell pickSboxImage where to look.
  const urls = collectUrls(raw, "");

  return NextResponse.json({
    slug,
    upstreamStatus: status,
    raw,
    discoveredUrls: urls,
  });
}

function collectUrls(
  node: unknown,
  path: string,
): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = [];
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node)) out.push({ path, value: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => out.push(...collectUrls(item, `${path}[${i}]`)));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out.push(...collectUrls(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

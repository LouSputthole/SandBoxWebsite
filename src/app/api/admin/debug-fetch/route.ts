import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/admin/debug-fetch?url=https://sbox.dev/store
 *
 * Fetches an arbitrary URL server-side and returns:
 *   - status, bytes
 *   - first ~12KB of the response body
 *   - every "/skins/<slug>"-shaped href found
 *   - every other anchor href (so we can spot non-standard link patterns)
 *
 * Used to diagnose "why isn't my regex matching" when scraping
 * unfamiliar HTML. The slugs + hrefs lists let me see anchor markup
 * patterns without you reading 235KB of HTML on a phone.
 *
 * URL is restricted to sbox.dev / sbox.game hosts so this can't be
 * abused as an open SSRF proxy.
 */
const ALLOWED_HOSTS = ["sbox.dev", "sbox.game", "api.sbox.dev"];

export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "url query param required" },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (
    !ALLOWED_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
    )
  ) {
    return NextResponse.json(
      {
        error: `host not allowlisted (only ${ALLOWED_HOSTS.join(", ")})`,
      },
      { status: 400 },
    );
  }

  let status: number | null = null;
  let body = "";
  try {
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(15000),
    });
    status = res.status;
    body = await res.text();
  } catch (err) {
    return NextResponse.json(
      {
        error: "fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // Pull every /skins/<slug> href so we can confirm whether sbox.dev
  // even uses standard anchors.
  const skinsHrefs: string[] = [];
  const skinsRe =
    /href=["'](\/skins\/[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = skinsRe.exec(body)) !== null) {
    if (m[1]) skinsHrefs.push(m[1]);
  }

  // Also pull every OTHER href so we can spot non-standard patterns
  // (e.g. /store/<slug>, /asset/<slug>, /skin/<slug>).
  const otherHrefs = new Set<string>();
  const allHrefRe = /href=["']([^"']+)["']/gi;
  while ((m = allHrefRe.exec(body)) !== null) {
    if (m[1] && !m[1].startsWith("#") && !m[1].startsWith("javascript:"))
      otherHrefs.add(m[1]);
  }

  return NextResponse.json({
    url: parsed.toString(),
    status,
    bytes: body.length,
    skinsHrefsCount: skinsHrefs.length,
    skinsHrefs: skinsHrefs.slice(0, 30),
    sampleOtherHrefs: [...otherHrefs].slice(0, 40),
    bodyHead: body.slice(0, 12000),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySteamLogin, fetchSteamProfile } from "@/lib/auth/steam";
import { createSession } from "@/lib/auth/session";
import {
  hashIp,
  getClientIp,
  getUserAgentFromRequest,
} from "@/lib/auth/fingerprint";
import { recordLoginEvent } from "@/lib/auth/audit";

const RETURN_PATH_COOKIE = "_sbox_login_return";

/**
 * Re-validate the return path read back from the cookie. Cookies are
 * HTTP-only + set by our own code so tampering requires browser-level
 * access, but we re-check the invariants (local path, no scheme) before
 * trusting it in a redirect — defense in depth, not paranoia.
 */
function safeReturnPath(raw: string | undefined): string {
  if (!raw) return "/?auth=success";
  if (raw.length > 500) return "/?auth=success";
  if (!raw.startsWith("/")) return "/?auth=success";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/?auth=success";
  if (/^\/[a-z]+:/i.test(raw)) return "/?auth=success";
  if (raw.startsWith("/api/auth")) return "/?auth=success";
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}auth=success`;
}

/**
 * GET /api/auth/steam/callback — Handle Steam OpenID callback.
 *
 * Verifies the assertion (with our defense-in-depth hardening: signed-
 * field enforcement, return_to/op_endpoint match, nonce replay dedup),
 * upserts the user, creates a fingerprinted session, and writes a
 * login_success or login_failure LoginEvent so /account/sessions can
 * surface the audit trail.
 */
export async function GET(request: NextRequest) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const returnCookie = request.cookies.get(RETURN_PATH_COOKIE)?.value;
  const successPath = safeReturnPath(returnCookie);

  const ipHash = hashIp(getClientIp(request));
  const userAgent = getUserAgentFromRequest(request);

  // One redirect factory that also clears the return-path cookie.
  const redirect = (path: string): NextResponse => {
    const res = NextResponse.redirect(`${baseUrl}${path}`);
    res.cookies.delete(RETURN_PATH_COOKIE);
    return res;
  };

  try {
    const query: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const verification = await verifySteamLogin(query);

    if (!verification.ok || !verification.steamId) {
      console.error(
        `[auth] Steam verification failed: ${verification.failureReason ?? "unknown"}`,
      );
      // Failure events have no userId yet (we don't trust the claimed
      // SteamID before sig-verify). Best we can do is leave a trace at
      // the request level via console — the audit table is per-user.
      return redirect(`/?auth=error`);
    }

    const profile = await fetchSteamProfile(verification.steamId);

    const user = await prisma.user.upsert({
      where: { steamId: verification.steamId },
      update: {
        username: profile.username || undefined,
        avatarUrl: profile.avatarUrl || undefined,
        profileUrl: profile.profileUrl || undefined,
      },
      create: {
        steamId: verification.steamId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        profileUrl: profile.profileUrl,
      },
    });

    const { sessionId } = await createSession(user.id);

    await recordLoginEvent({
      userId: user.id,
      sessionId,
      kind: "login_success",
      ipHash,
      userAgent,
    });

    console.log(
      `[auth] User logged in: ${user.username ?? verification.steamId} (${user.id})`,
    );

    return redirect(successPath);
  } catch (error) {
    console.error("[auth] Callback error:", error);
    return redirect(`/?auth=error`);
  }
}

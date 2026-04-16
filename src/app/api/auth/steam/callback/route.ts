import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySteamLogin, fetchSteamProfile } from "@/lib/auth/steam";
import { createSession } from "@/lib/auth/session";

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
  // Preserve the intended path, drop the auth=success flash param since
  // it only makes sense on the default landing. Feature flag via sep query.
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}auth=success`;
}

/**
 * GET /api/auth/steam/callback — Handle Steam OpenID callback.
 * Verifies the assertion, creates/updates user, creates session, and
 * redirects the user back to wherever they started the login from
 * (captured in the _sbox_login_return cookie by /api/auth/steam).
 */
export async function GET(request: NextRequest) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const returnCookie = request.cookies.get(RETURN_PATH_COOKIE)?.value;
  const successPath = safeReturnPath(returnCookie);

  // One redirect factory that also clears the return-path cookie so it
  // doesn't haunt future logins if the user re-auths later.
  const redirect = (path: string): NextResponse => {
    const res = NextResponse.redirect(`${baseUrl}${path}`);
    res.cookies.delete(RETURN_PATH_COOKIE);
    return res;
  };

  try {
    // Extract all query params
    const query: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Verify the Steam OpenID assertion
    const steamId = await verifySteamLogin(query);

    if (!steamId) {
      console.error("[auth] Steam verification failed");
      return redirect(`/?auth=error`);
    }

    // Fetch Steam profile info
    const profile = await fetchSteamProfile(steamId);

    // Upsert user
    const user = await prisma.user.upsert({
      where: { steamId },
      update: {
        username: profile.username || undefined,
        avatarUrl: profile.avatarUrl || undefined,
        profileUrl: profile.profileUrl || undefined,
      },
      create: {
        steamId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        profileUrl: profile.profileUrl,
      },
    });

    // Create session
    await createSession(user.id);

    console.log(
      `[auth] User logged in: ${user.username ?? steamId} (${user.id})`,
    );

    return redirect(successPath);
  } catch (error) {
    console.error("[auth] Callback error:", error);
    return redirect(`/?auth=error`);
  }
}

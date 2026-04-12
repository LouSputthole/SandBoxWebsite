import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySteamLogin, fetchSteamProfile } from "@/lib/auth/steam";
import { createSession } from "@/lib/auth/session";

/**
 * GET /api/auth/steam/callback — Handle Steam OpenID callback.
 * Verifies the assertion, creates/updates user, creates session.
 */
export async function GET(request: NextRequest) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

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
      return NextResponse.redirect(`${baseUrl}/?auth=error`);
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

    // Redirect back to the site — the client will merge localStorage watchlist
    return NextResponse.redirect(`${baseUrl}/?auth=success`);
  } catch (error) {
    console.error("[auth] Callback error:", error);
    return NextResponse.redirect(`${baseUrl}/?auth=error`);
  }
}

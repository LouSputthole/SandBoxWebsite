import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * GET /api/auth/me — Return the current logged-in user.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      steamId: user.steamId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      profileUrl: user.profileUrl,
    },
  });
}

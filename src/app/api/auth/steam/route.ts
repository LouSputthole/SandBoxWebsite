import { NextResponse } from "next/server";
import { getSteamLoginUrl } from "@/lib/auth/steam";

/**
 * GET /api/auth/steam — Redirect to Steam login.
 */
export async function GET() {
  const url = getSteamLoginUrl();
  return NextResponse.redirect(url);
}

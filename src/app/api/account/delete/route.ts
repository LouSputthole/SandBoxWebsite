import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, destroySession } from "@/lib/auth/session";
import { deleteAccount, AccountDeletionBlockedError } from "@/lib/account/delete-account";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete — self-service account deletion / data erasure (DSAR).
 *
 * Authed via the session cookie; a user may delete ONLY their own account. Requires an explicit
 * `{ "confirm": "DELETE" }` body so it can't fire by accident (400 otherwise). On success we run
 * {@link deleteAccount} (off-chain hard-delete + anonymize, escrow-safety-guarded), then clear the
 * session cookie — the user is logged out (their sessions were deleted in the transaction anyway).
 *
 *   - 401 — not signed in
 *   - 400 — missing / wrong confirmation, or invalid JSON
 *   - 409 — {@link AccountDeletionBlockedError}: live orders / active listing must settle first
 *   - 200 — { deleted: true, summary }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Type-to-confirm required. Send { "confirm": "DELETE" } to proceed.' },
      { status: 400 },
    );
  }

  try {
    const summary = await deleteAccount(user.id);
    // Clear the session cookie. The session rows were already deleted inside deleteAccount, so
    // destroySession finds nothing to log and simply drops the cookie — the user is signed out.
    await destroySession();
    return NextResponse.json({ deleted: true, summary });
  } catch (err) {
    if (err instanceof AccountDeletionBlockedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[account/delete] failed:", err);
    return NextResponse.json({ error: "Could not delete your account. Please try again." }, { status: 500 });
  }
}

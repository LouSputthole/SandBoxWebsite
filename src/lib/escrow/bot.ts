/**
 * Escrow-bot abstraction. The actual bot worker (node-steam-user +
 * steam-tradeoffer-manager) cannot run on Vercel — Vercel functions
 * are stateless + short-lived, and the Steam clients need long-lived
 * sockets + 2FA-codegen running in a loop. The worker lives on
 * Railway/Fly/whatever and polls our internal API for "what should I
 * do next?" + posts back what happened.
 *
 * This file just defines the shape of bot interactions so:
 *   1. The web app's escrow-trade controllers can call into a typed
 *      surface without caring whether it's a real bot or a mock.
 *   2. Tests can swap in a deterministic mock implementation.
 *   3. The bot worker (separate repo / Dockerfile) consumes the same
 *      types so the API contract between web ↔ worker is enforced.
 *
 * For the web app's purposes we only ever READ from this surface
 * (e.g. "is the bot online?" for the buy-now button gate). All
 * mutation happens via the worker calling our internal API endpoints,
 * NOT the web app calling a bot directly.
 */

export interface EscrowBotIdentity {
  /** Internal opaque id (matches EscrowBotAccount.id). */
  id: string;
  steamId: string;
  label: string;
  status: "active" | "banned" | "maintenance";
}

export interface BotHealthcheck {
  ok: boolean;
  /** Last time we successfully verified the bot can log in. */
  at: Date;
  /** Best-effort reason when ok=false. */
  reason?: string;
}

/**
 * Chooser strategy: pick the active bot with the fewest in-flight
 * trades, falling back to round-robin within ties. Implementations
 * delegate to this at trade-create time. Returns null when no bot has
 * capacity — caller should reject the buy-now and surface "out of
 * escrow capacity, try later" to the buyer.
 */
export interface BotSelection {
  selectAvailable(): Promise<EscrowBotIdentity | null>;
}

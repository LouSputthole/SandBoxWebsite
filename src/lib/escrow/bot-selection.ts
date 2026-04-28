import { prisma } from "@/lib/db";
import type { BotSelection, EscrowBotIdentity } from "./bot";
import { isOpen } from "./state-machine";

/**
 * Default bot-selection strategy. Among "active" bots, pick the one
 * with the fewest open trades (capped at maxConcurrentTrades). Ties
 * break by id-asc for determinism in tests + so logs are stable.
 *
 * Returns null when every active bot is at capacity OR there are no
 * active bots at all. Caller surfaces that as "escrow temporarily
 * unavailable" — buyer should retry in a few minutes; ops should add
 * capacity (spin up another bot) if the saturation persists.
 */
export const defaultBotSelection: BotSelection = {
  async selectAvailable(): Promise<EscrowBotIdentity | null> {
    const bots = await prisma.escrowBotAccount.findMany({
      where: { status: "active" },
      orderBy: { id: "asc" },
    });
    if (bots.length === 0) return null;

    // Count open trades per bot in one query so we don't N+1.
    const counts = await prisma.escrowTrade.groupBy({
      by: ["botAccountId"],
      where: {
        botAccountId: { in: bots.map((b) => b.id) },
        state: {
          in: [
            "pending_deposit",
            "awaiting_payment",
            "payment_confirmed",
            "disputed",
          ],
        },
      },
      _count: { _all: true },
    });
    const countById = new Map(
      counts.map((c) => [c.botAccountId ?? "", c._count._all]),
    );

    let best: { bot: (typeof bots)[number]; load: number } | null = null;
    for (const bot of bots) {
      const load = countById.get(bot.id) ?? 0;
      if (load >= bot.maxConcurrentTrades) continue;
      if (!best || load < best.load) best = { bot, load };
    }
    if (!best) return null;
    return {
      id: best.bot.id,
      steamId: best.bot.steamId,
      label: best.bot.label,
      status: "active",
    };
  },
};

// Re-export so callers don't have to know which file the helper is in.
export { isOpen };

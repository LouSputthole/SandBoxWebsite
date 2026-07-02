import { prisma } from "@/lib/db";
import { assertNotBanned } from "./bans";

/** Max review comment length (chars). Longer input is truncated, not rejected (matches dispute). */
export const REVIEW_COMMENT_MAX = 500;

/**
 * A review write that failed a business rule, carrying the HTTP status the route should surface:
 *  - 404 not the order's buyer / no such order (no existence leak — same as a missing order)
 *  - 409 order not yet RELEASED, or already reviewed (one review per order)
 *  - 400 invalid stars
 */
export class ReviewError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export interface CreateReviewInput {
  orderId: string;
  /** The session user — MUST be the order's buyer. */
  buyerId: string;
  stars: number;
  comment?: string | null;
}

/**
 * Record the buyer's rating of the seller for a COMPLETED order. Real rep only — a review can exist
 * ONLY when: the caller is the order's buyer, the order is RELEASED (money actually settled to the
 * seller), and no prior review exists (orderId is unique → the second attempt is a 409, never a
 * silent overwrite). stars is validated 1..5 (the DB CHECK is the backstop). Returns the new review.
 */
export async function createReview(input: CreateReviewInput) {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    throw new ReviewError("stars must be a whole number from 1 to 5", 400);
  }
  const comment = input.comment?.trim().slice(0, REVIEW_COMMENT_MAX) || null;

  const order = await prisma.marketOrder.findUnique({
    where: { id: input.orderId },
    select: { buyerId: true, sellerId: true, state: true },
  });
  // Non-buyer (or missing order) → 404, no existence leak (mirrors the privacy route).
  if (!order || order.buyerId !== input.buyerId) throw new ReviewError("order not found", 404);
  if (order.state !== "RELEASED") {
    throw new ReviewError("you can only review a seller once the order is complete", 409);
  }

  // Ban gate — a banned rater (by Steam id OR linked wallet) can't leave marketplace reputation.
  // Throws MarketBannedError; the review route's catch-all surfaces its generic message as 400.
  const rater = await prisma.user.findUnique({
    where: { id: input.buyerId },
    select: { steamId: true, wallet: { select: { address: true } } },
  });
  await assertNotBanned({ steamId: rater?.steamId, walletAddress: rater?.wallet?.address });

  try {
    return await prisma.marketReview.create({
      data: {
        orderId: input.orderId,
        raterId: input.buyerId,
        ratedId: order.sellerId,
        stars: input.stars,
        comment,
      },
    });
  } catch (err) {
    // Unique orderId violation — a review already exists for this order. P2002 detected structurally
    // (no runtime Prisma value import — vitest can't resolve the generated client's `@/` alias).
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      throw new ReviewError("you've already reviewed this order", 409);
    }
    throw err;
  }
}

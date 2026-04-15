import { TwitterApi } from "twitter-api-v2";

/**
 * Twitter/X API client using OAuth 1.0a User Context — the auth mode that
 * allows posting tweets on behalf of the account that minted the access token.
 *
 * Required env vars (create at https://developer.x.com/en/portal/dashboard):
 *   TWITTER_API_KEY              — app-level "Consumer Key"
 *   TWITTER_API_SECRET           — app-level "Consumer Secret"
 *   TWITTER_ACCESS_TOKEN         — user access token for @SboxSkinsgg
 *   TWITTER_ACCESS_TOKEN_SECRET  — user access token secret
 *
 * Returns null if credentials aren't configured so callers can degrade gracefully.
 */
export function getTwitterClient(): TwitterApi | null {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }

  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  });
}

export interface TweetResult {
  success: boolean;
  tweetId?: string;
  tweetUrl?: string;
  error?: string;
  rateLimitedUntil?: number;
}

/**
 * Post a tweet. Text must be <= 280 characters (URLs count as ~23 chars each
 * via t.co shortening — twitter-api-v2 does NOT auto-shorten, but X does at
 * post time). Returns tweet ID + URL on success, structured error on failure.
 */
export async function postTweet(text: string): Promise<TweetResult> {
  const client = getTwitterClient();
  if (!client) {
    return {
      success: false,
      error: "Twitter credentials not configured (set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET in env).",
    };
  }

  try {
    const result = await client.v2.tweet(text);
    const id = result.data.id;
    return {
      success: true,
      tweetId: id,
      tweetUrl: `https://x.com/SboxSkinsgg/status/${id}`,
    };
  } catch (err) {
    const e = err as { code?: number; data?: { title?: string; detail?: string }; rateLimit?: { reset?: number } };
    if (e.code === 429) {
      return {
        success: false,
        error: "Rate limited by Twitter API",
        rateLimitedUntil: e.rateLimit?.reset,
      };
    }
    const msg = e.data?.detail || e.data?.title || String(err);
    return { success: false, error: msg };
  }
}

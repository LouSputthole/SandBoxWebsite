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

/**
 * Post a reply to a specific tweet. Same rules as postTweet + we scope it to
 * the target tweet so X threads it correctly.
 */
export async function postReply(text: string, inReplyToTweetId: string): Promise<TweetResult> {
  const client = getTwitterClient();
  if (!client) {
    return { success: false, error: "Twitter credentials not configured." };
  }

  try {
    const result = await client.v2.reply(text, inReplyToTweetId);
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

export interface TweetWithAuthor {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  tweetUrl: string;
}

/**
 * Search recent tweets mentioning S&box-related keywords or our account.
 * Returns the last 24 hours, excluding retweets and our own tweets.
 */
export async function searchSboxMentions(maxResults = 20): Promise<TweetWithAuthor[]> {
  const client = getTwitterClient();
  if (!client) return [];

  // Twitter search query:
  // - match any of the core S&box keywords (we add hash/plain variants)
  // - exclude retweets (they're not real engagement)
  // - exclude our own account (don't reply to ourselves)
  // - English only (tighter signal)
  const keywords = [
    '"s&box"', '"sbox skin"', '"sbox skins"', "#sbox", "#sandbox",
    "@SboxSkinsgg", "sboxskins.gg",
  ];
  const query = `(${keywords.join(" OR ")}) -is:retweet -from:SboxSkinsgg lang:en`;

  try {
    const res = await client.v2.search(query, {
      max_results: Math.min(100, Math.max(10, maxResults)),
      "tweet.fields": ["created_at", "author_id"],
      expansions: ["author_id"],
      "user.fields": ["username", "name"],
    });

    const users = new Map<string, { username: string; name: string }>();
    for (const u of res.includes?.users ?? []) {
      users.set(u.id, { username: u.username, name: u.name });
    }

    const tweets: TweetWithAuthor[] = [];
    for (const t of res.data?.data ?? []) {
      const user = users.get(t.author_id ?? "") ?? {
        username: "unknown",
        name: "unknown",
      };
      tweets.push({
        id: t.id,
        text: t.text,
        createdAt: t.created_at ?? new Date().toISOString(),
        authorId: t.author_id ?? "",
        authorUsername: user.username,
        authorName: user.name,
        tweetUrl: `https://x.com/${user.username}/status/${t.id}`,
      });
    }
    return tweets;
  } catch (err) {
    const e = err as { code?: number; data?: { detail?: string } };
    console.error("[twitter] Search failed:", e.data?.detail || err);
    return [];
  }
}

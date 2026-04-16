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
 * Terms that indicate the tweet is about something OTHER than S&box even
 * though it matched our search keywords. "sbox" collides with xbox in
 * context; "sandbox" catches Minecraft, Roblox, The Sandbox crypto, etc.
 * If a candidate tweet contains any of these words AND lacks any positive
 * anchor (below), we drop it.
 */
const FALSE_POSITIVE_TERMS: readonly RegExp[] = [
  /\bxbox\b/i,
  /\bminecraft\b/i,
  /\broblox\b/i,
  /\bnintendo\b/i,
  /\bplaystation\b/i,
  /\bthe\s+sandbox\b/i, // crypto token
  /\b\$sand\b/i, // Sandbox crypto ticker
  /\bgarry'?s\s+mod\b/i, // Gmod posts sometimes mention sbox but aren't S&box market
  /\bunity\s+sandbox\b/i,
  /\bsandbox\s+(mode|game|world|build(er)?|minecraft|roblox)/i,
];

/**
 * Positive anchors — if any of these appear, the tweet is almost
 * certainly about S&box even if a false-positive term also appears.
 * Used to override the false-positive filter when someone legitimately
 * mentions xbox AND S&box in the same tweet.
 */
const POSITIVE_ANCHORS: readonly RegExp[] = [
  /\bs&box\b/i,
  /\bs&\s?box\b/i,
  /\bsbox\s+(skin|skins|cosmetic|cosmetics|market|trading|trade|hat|helmet|outfit)/i,
  /\bfacepunch\b/i,
  /\bsboxgame\b/i,
  /\bsboxskins\b/i,
  /\bsbox\.gg\b/i,
  /\bsboxskins\.gg\b/i,
  /@sboxskinsgg\b/i,
];

/**
 * Search recent tweets mentioning S&box-related keywords or our account.
 * Returns the last 24 hours, excluding retweets and our own tweets.
 *
 * Post-search we filter out tweets that matched a generic keyword (like
 * #sbox) but are actually about xbox/minecraft/roblox/the-sandbox-crypto.
 * This cuts the noise floor dramatically — we used to pull in anything
 * mentioning the word "sandbox" which is basically every game.
 */
export async function searchSboxMentions(maxResults = 20): Promise<TweetWithAuthor[]> {
  const client = getTwitterClient();
  if (!client) return [];

  // Stricter keyword set — dropped #sbox (too often typos) and #sandbox
  // (catches Minecraft + Roblox + crypto). Replaced with multi-word
  // phrases that are almost never coincidental + our unique hashtags.
  const keywords = [
    '"s&box"',
    '"sbox skin"',
    '"sbox skins"',
    '"sbox cosmetic"',
    '"sbox cosmetics"',
    '"sbox market"',
    '"sbox trading"',
    "#sboxgame",
    "#sboxskins",
    "#sboxcosmetics",
    "@SboxSkinsgg",
    "sboxskins.gg",
  ];
  const query = `(${keywords.join(" OR ")}) -is:retweet -from:SboxSkinsgg lang:en`;

  // Ask Twitter for more than we need so post-filter losses don't leave
  // us thin on results.
  const fetchCount = Math.min(100, Math.max(20, maxResults * 2));

  try {
    const res = await client.v2.search(query, {
      max_results: fetchCount,
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
      // Post-filter: if the tweet has any false-positive term AND no
      // S&box-specific positive anchor, drop it. Keeps mentions that
      // legitimately reference xbox + S&box together but filters out
      // xbox-only, minecraft, etc.
      const text = t.text;
      const hasNegative = FALSE_POSITIVE_TERMS.some((re) => re.test(text));
      const hasPositive = POSITIVE_ANCHORS.some((re) => re.test(text));
      if (hasNegative && !hasPositive) continue;

      const user = users.get(t.author_id ?? "") ?? {
        username: "unknown",
        name: "unknown",
      };
      tweets.push({
        id: t.id,
        text,
        createdAt: t.created_at ?? new Date().toISOString(),
        authorId: t.author_id ?? "",
        authorUsername: user.username,
        authorName: user.name,
        tweetUrl: `https://x.com/${user.username}/status/${t.id}`,
      });
      if (tweets.length >= maxResults) break;
    }
    return tweets;
  } catch (err) {
    const e = err as { code?: number; data?: { detail?: string } };
    console.error("[twitter] Search failed:", e.data?.detail || err);
    return [];
  }
}

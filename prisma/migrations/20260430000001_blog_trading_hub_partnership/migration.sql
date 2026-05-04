-- Trading Hub partnership announcement post. Placeholders for the
-- Hub's official Discord URL + canonical name pull through from
-- src/lib/partner/config.ts when rendered (the page reads from the
-- DB but inline anchors point at our own /go/hub redirect that
-- resolves via PARTNER config). Idempotent — ON CONFLICT DO NOTHING
-- so re-runs in dev are no-ops.
--
-- WHEN PARTNER CONFIRMS DETAILS:
-- 1. Update src/lib/partner/config.ts with their real Discord URL
-- 2. (Optional) UPDATE this post's content in a follow-up migration
--    with their final blurb / quote if they send one. Slug + URL
--    stay stable.

INSERT INTO "BlogPost" (
    "id",
    "slug",
    "title",
    "excerpt",
    "content",
    "kind",
    "publishedAt",
    "createdAt",
    "updatedAt"
)
VALUES (
    'blog-trading-hub-partnership',
    'trading-hub-partnership',
    'We''re partnering with the S&box Trading Hub',
    'Trading info on sboxskins.gg, in-person trades at the S&box Trading Hub. Two communities, one bigger trading scene. Here''s what changes for you.',
    $BODY$Quick one. We're officially partnering with the **S&box Trading Hub** — the in-game meet-up spot + Discord community where S&box traders coordinate face-to-face deals.

This is a community partnership, not an acquisition or anything corporate. Both sides keep doing what they do best, and we make it easier for users to flow between them.

## What this means if you trade S&box skins

**Use sboxskins.gg for the data side of a trade.** Price history, supply, owner counts, scarcity scores, store rotation, market trends. Look up what something's actually worth before you commit.

**Use the Trading Hub for the social side.** Show up in-game, hop on their Discord, find someone trading the thing you want, do the deal in person without the fee + friction of the Steam Market.

Together they cover the full flow: research → reach out → trade → track. No piece of that needs to live on one site.

## What's changing on sboxskins.gg

Three things you'll see today:

- **Footer badge** — Trading Hub partner callout site-wide so it's easy to find from any page
- **`/trade` page banner** — quick link to the Hub for anyone browsing our trading board
- **Top-nav link** — direct shortcut to their Discord

Coming next week: a **"Meet at the Trading Hub"** option when you post a trade listing here. Pick that, and your listing tells potential trade partners to coordinate at the Hub instead of via Steam trade offers. We'll write up the details when it ships.

## What's changing on their side

The Hub team is mirroring the partnership their direction:
- A **partners** section on their public listings recognizing sboxskins.gg
- A **dedicated channel** in their Discord where market-data questions get pointed at the right item pages on our site
- An **in-game sign / board** at the Trading Hub location flagging us as the recommended pricing reference

If you're already in the Hub's Discord, you'll see the announcement post pinned for the next day or so.

## Why we did this

S&box's trading scene is small enough today that fragmentation hurts everyone. Two communities serving overlapping audiences with different strengths (their face-to-face culture, our data depth) only really win if users move freely between them. The partnership formalizes what was already happening informally.

No revenue-sharing, no affiliate codes, no paid placements — just two community projects that wanted to make each other easier to use.

[Join the S&box Trading Hub →](/go/hub) — Discord invite + in-game directions.$BODY$,
    'announcement',
    '2026-04-30T19:00:00.000Z',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

-- Store rotation announcement post. Wendy's-Twitter voice, run-down of
-- the 29 new skins that landed April 29, prices we have, and the
-- watch-list items. Idempotent — ON CONFLICT (slug) DO NOTHING for
-- re-runs in dev.

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
    'blog-store-rotation-april-29',
    'store-rotation-april-29',
    'Store rotation just landed — 29 new skins, vibes inside',
    'Full rundown of the April 29 S&box store drop. Crash Test Dummy headlines at $15, plus quick takes on every new skin, what to grab before the 30-day window closes, and the rares to actually pay attention to.',
    $BODY$So the store flipped. 29 fresh skins landed this week, the whole rotation dated April 29, and we've got just under 30 days before any of them disappear into "now you can only get it on the secondary market" land. Quick rundown.

## The headline drop: Crash Test Dummy

[$15.00 in store](/items/crash-test-dummy). The most expensive thing in this rotation by a country mile. Special-tier hat, supply already at ~630 units two days in, 48 unique owners.

That's a thin float — fewer than 10% of buyers sitting on multiples — which is the kind of distribution that makes secondary-market action interesting once the 7-day trade hold lifts. If you're a flipper, this is the one to watch. If you're a collector, the price suggests Facepunch is positioning it as the rotation's flagship.

## The bargain bin (under $2.50)

A bunch of these are going to age well precisely *because* they're cheap on entry:

- **[Lumberjack Shirt](/items/lumberjack-shirt)** — $1.50. "Perfect for chopping wood." That's the entire flavor text. Iconic.
- **[Paper 3D Glasses](/items/paper-3d-glasses)** — $1.00. "Add some depth to your life." Whoever writes Facepunch's store copy is not getting paid enough.
- **[Cat Balaclava](/items/toothpick)** — $2.50. The slug is literally "toothpick" on sbox.dev. Don't ask. "Stay anonymous, yet adorable."
- **[Fresh Mask](/items/fresh-mask)** — $2.50. Cucumber eyes. We are living in the timeline where someone modeled cucumber eyes on a mask.
- **[Sneakers Gravity](/items/sneakers-gravity)** — $2.00. "black and white, ahh classic..." Self-aware skin descriptions are a vibe.

## The mid-tier ($2.50 to $5)

- **[Leather Coat](/items/leather-coat)** — $2.50. "Classic outerwear for cool weather." Honestly the one I'd wear if S&box translated to real life.
- **[Prison Jumpsuit](/items/prison-jumpsuit)** — $5.00. Flavor text says it's "for just chilling in your cell." Highly specific, very committed bit.
- **[Sneakers Gravity Led Blue](/items/sneakers-gravity-led-blue)** — $4.50. "Shine brighter than a diamond."

## What I'm watching

Three things to keep an eye on over the next 30 days:

1. **Crash Test Dummy supply curve.** Already 630 units after two days. If that climbs past 2,000 by mid-rotation, the eventual market price gets capped. If supply growth slows because Facepunch sells through the rotation slowly, that's bullish for post-rotation pricing.
2. **Cat Balaclava distribution.** Small initial owner count (still under 100 unique). Anything with this distribution shape plus a memorable design tends to over-perform on the secondary market. Floor's $2.50, ceiling's whatever the meme demand sets.
3. **Paper 3D Glasses as the cheapest bet.** At $1.00, the lowest barrier in the rotation. Even if it ends up worth $1.50 on the secondary market, that's a 50% return — and at this price the only real way to lose money is if it never moves at all.

## What's leaving June 1

Every item in this rotation goes dark on **June 1, 2026** unless Facepunch extends. Nothing to do about it now except not sleep on the ones you actually want — the secondary market always charges a premium once an item is delisted.

We're tracking all 29 at the [store page](/store) with live supply + countdowns, plus per-item charts on each item page. Bookmark whatever catches your eye, and we'll be back when the next rotation drops.$BODY$,
    'announcement',
    '2026-04-29T20:00:00.000Z',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

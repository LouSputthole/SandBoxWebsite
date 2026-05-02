-- Correct the store-rotation post: only 9 of the 29 visible store
-- items are rotating new drops; the other 20 are permanent inventory.
-- Updates title/excerpt/body in place so the slug + publishedAt stay
-- stable (no broken links from the announcement banner or anywhere
-- else that linked the post). Idempotent — re-running sets the same
-- values.

UPDATE "BlogPost"
SET
    "title" = 'Store rotation just dropped — 9 new skins, vibes inside',
    "excerpt" = 'Quick takes on the 9 new rotating skins in the S&box store this April 29. Crash Test Dummy headlines at $15, plus the bargain-bin bets and what to actually watch over the next 30 days.',
    "content" = $BODY$The store rotation just landed. **9 fresh skins** on top of the 20 permanent items, and we've got just under 30 days before the rotating bunch goes dark on June 1. Quick rundown of what's new.

## The headline: Crash Test Dummy

[$15.00 in store](/items/crash-test-dummy). The most expensive thing in this rotation by a country mile. Special-tier hat, supply already at ~630 units two days in, 48 unique owners.

That's a thin float — fewer than 10% of buyers sitting on multiples — which is the kind of distribution that makes secondary-market action interesting once the 7-day trade hold lifts. If you're a flipper, this is the one to watch. If you're a collector, the price tells you Facepunch is positioning it as the rotation's flagship.

## The bargain bin (under $2.50)

Cheap entry, potentially good return:

- **[Paper 3D Glasses](/items/paper-3d-glasses)** — $1.00. "Add some depth to your life." Whoever writes Facepunch's store copy is not getting paid enough.
- **[Lumberjack Shirt](/items/lumberjack-shirt)** — $1.50. "Perfect for chopping wood." That's the entire flavor text. Iconic.
- **[Sneakers Gravity](/items/sneakers-gravity)** — $2.00. "black and white, ahh classic..." Self-aware skin descriptions are a vibe.

## The mid-tier ($2.50)

- **[Cat Balaclava](/items/toothpick)** — $2.50. The slug is literally "toothpick" on sbox.dev. Don't ask. "Stay anonymous, yet adorable."
- **[Leather Coat](/items/leather-coat)** — $2.50. "Classic outerwear for cool weather." Honestly the one I'd wear if S&box translated to real life.
- **[Fresh Mask](/items/fresh-mask)** — $2.50. Cucumber eyes. We are living in the timeline where someone modeled cucumber eyes on a mask.
- **[Fanny Pack](/items/fanny-pack)** — utility-coded accessory, dad-energy redemption arc.

## Premium

- **[Sneakers Gravity Led Blue](/items/sneakers-gravity-led-blue)** — $4.50. "Shine brighter than a diamond."

## What I'm watching

1. **Crash Test Dummy supply curve.** Already 630 units after two days. If it climbs past 2,000 mid-rotation, the eventual market cap stays low. If supply growth slows because Facepunch sells through the rotation slowly, post-rotation pricing has room.
2. **Cat Balaclava distribution.** Small initial owner count plus a memorable design is the shape that over-performs on the secondary market. Floor is $2.50, ceiling is wherever meme demand sets it.
3. **Paper 3D Glasses as the cheapest bet.** At $1.00, the lowest barrier in the rotation. Even at $1.50 secondary, that's a 50% return — and at this price the only real way to lose is if it doesn't move at all.

## What's leaving June 1

The 20 permanent items aren't going anywhere — those stay in the store indefinitely. But these 9 rotating drops go dark on **June 1, 2026** unless Facepunch extends, and the secondary market always charges a premium once an item is delisted.

We're tracking the full set at the [store page](/store) with live supply + countdowns, plus per-item charts on each item page. Bookmark whatever catches your eye, and we'll be back when the next rotation drops.$BODY$,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'store-rotation-april-29';

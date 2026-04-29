-- Seed the launch-day blog post. Idempotent: if the slug already
-- exists (re-running the migration in a dev DB), the INSERT silently
-- skips via ON CONFLICT.
--
-- Body uses PostgreSQL dollar-quoted strings ($BODY$...$BODY$) so we
-- don't have to escape every apostrophe in the markdown.

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
    'blog-sbox-launch-day-vibe-check',
    'sbox-launch-day-vibe-check',
    'S&box launch day: ngl, this one went hard',
    'S&box hit Steam on April 28 with a Mostly Positive rating, a royalty-free creator deal with Valve, and an open-source engine. Quick vibe check from launch week.',
    $BODY$S&box dropped on Steam yesterday, $20, and the early temperature read is good. [Mostly Positive](https://steambase.io/games/s-box/reviews) on the Steam page (around 2,250 positive vs 720-ish negative at the time of writing), Twitch full of people figuring out the editor on stream, and the Reddit and Steam forums are mostly people yelling "happy launch day" at each other. As someone who lived through the entire decade-long s&box wait, this feels earned.

A few things worth pointing out, because the press cycle around this launch has been noisier than the actual community response.

## Garry doesn't really miss

It's easy to forget how absurd Facepunch's track record is. [Garry's Mod has done about $108M in revenue across 16M copies](https://www.pcgamer.com/rust-has-made-more-money-than-garrys-mod/). [Rust has done around $142M across 9M copies](https://www.pcgamer.com/rust-has-made-more-money-than-garrys-mod/) and is still the top survival game on Steam. Both games are over a decade old and both still print money. That's not a studio that ships and bails. That's a studio that ships and then keeps shipping for ten years.

So when people post the obligatory "is this gonna be abandoned in six months" Steam review, you can roll your eyes a little. Facepunch's whole identity is patching games well past the point where every other studio would have moved on. [s&box turned its first monthly profit in April 2026](https://www.pcgamesn.com/sandbox/garrys-mod-developers-profit-sandbox), which is the metric that actually matters for whether the platform sticks around.

## The AI slop discourse is a nothingburger

[Kotaku ran a piece](https://kotaku.com/garrys-mod-sbox-steam-reviews-facepunch-ai-2000691298) about an "influx of AI slop" on the platform and a few negative reviews picked up on it. Sure, that exists. It exists on every UGC platform that has ever existed. Roblox, Steam Workshop, the App Store, YouTube, itch. The way you handle it is the way every one of those platforms handles it: ranking, popularity signals, curation, votes. Quality content rises, garbage sinks.

Look at what's actually getting played: [Sausage Survivors 2](https://sbox.game/facepunch/ss2), community shooters, roleplay servers, racing games. The same thing that happened on GMod 20 years ago is happening here, except the tooling is better and the games can be sold standalone. Worry less.

## Open source is a real gift

One thing I don't want to get buried under launch-day noise: Facepunch [open-sourced the entire C# layer of the engine under MIT in November](https://sbox.game/news/update-25-11-26). The editor, the scene system, networking, UI, all of it is sitting on [GitHub](https://github.com/Facepunch/sbox-public) for anyone to read, fork, learn from, or yank into their own engine.

They did not have to do that. The Source 2 bits stay closed because that's Valve's call, but everything Facepunch wrote themselves is now a public reference. Students get a real C# game engine to study. Indie devs get a Unity escape hatch that isn't Godot. Modders get to actually fix things instead of filing bugs into a void. That's a meaningful contribution to gamedev that nobody was demanding from them, and it's worth saying out loud.

## The creator deal is the real story

[Valve and Facepunch worked out a license](https://www.gamesradar.com/games/garrys-mod-follow-up-s-and-box-will-launch-on-steam-with-sustainable-payout-for-people-using-it-to-make-games-as-devs-say-with-a-wink-we-dont-have-to-fire-1000-people-to-keep-it-working/) that lets you build a game in s&box, export it, and sell it on Steam as a standalone product. Royalty-free to Facepunch. That's the bit Garry has been pointing at for years when he calls Garry's Mod "a dead end for developers". On GMod you made Lua that didn't transfer anywhere. On s&box you make C# games that can ship as actual products. The Play Fund has already paid creators [over $500K](https://games.gg/news/sbox-steam-launch-creator-payouts/) out of GMod's ongoing profits.

That's the loop you want for a creation platform: people make stuff, the good stuff bubbles up, the people who made it can earn from it without being trapped in the host platform forever.

Is it perfect? No. The Steam Deck experience is [reportedly not great yet](https://steamdeckhq.com/news/sbox-isnt-great-on-steam-deck-so-far/). Performance is uneven on lower-end hardware. There will be a month of teething. But the foundation is the right shape, the studio shipping it has the runway and the receipts, and the community taking root looks like the GMod community circa 2008, which worked out alright.

We're tracking the cosmetics economy at [sboxskins.gg](https://sboxskins.gg) if you want to watch how the early market shakes out. Otherwise: go boot it up. The first weekend of any UGC platform is the one you'll tell stories about later.$BODY$,
    'announcement',
    '2026-04-28T20:30:00.000Z',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

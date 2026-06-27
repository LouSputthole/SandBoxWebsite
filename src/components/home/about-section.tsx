import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QA {
  q: string;
  a: ReactNode;
}

// SEO copy is load-bearing for this site's "sbox skins" ranking — keep all of
// it, just restyled to the Arcade About layout. Internal links to /trends and
// /leaderboard are preserved.
const QAS: QA[] = [
  {
    q: "What are S&box skins and cosmetics?",
    a: "S&box skins (often written as sbox skins, since the game's shorthand drops the ampersand) are customization items for S&box — the sandbox game from Facepunch Studios, the studio behind Garry's Mod and Rust. Cosmetics include hats, clothing, character models, weapon reskins, and accessories that let players personalize their in-game avatar. Every sbox cosmetic is tradable through the Steam Community Market.",
  },
  {
    q: "Where do S&box market prices come from?",
    a: "We pull live sbox market prices and order book data directly from the Steam Community Market every 15–30 minutes, 24/7. Total supply counts come from sbox.game's official skin metrics page. Price history is stored over time so you can track S&box cosmetics values across days, weeks, and months.",
  },
  {
    q: "How do I buy or sell S&box cosmetics?",
    a: "All S&box cosmetics trading happens on the Steam Community Market. Find an item you want on sboxskins.gg, click “View on Steam Market”, and complete the transaction through Steam. To sell, open your Steam Inventory and list your sbox cosmetic — check our order book first to price it competitively.",
  },
  {
    q: "What makes an S&box skin valuable?",
    a: (
      <>
        Sbox skin prices are driven by scarcity and demand. Lower total supply,
        limited-edition status, delisted store availability, and cosmetic appeal
        all push prices up on the S&box market. Our{" "}
        <Link href="/trends" className="text-accent hover:underline">
          trends page
        </Link>{" "}
        and{" "}
        <Link href="/leaderboard" className="text-accent hover:underline">
          leaderboard
        </Link>{" "}
        track these signals in real time so you can spot the next big sbox
        cosmetics mover.
      </>
    ),
  },
  {
    q: "Is there an S&box marketplace?",
    a: "Yes — the Steam Community Market is the official S&box marketplace. We aggregate every sbox cosmetic listed there, add supply and scarcity data, and make it searchable, filterable, and comparable on one page. Think of sboxskins.gg as the analytics layer on top of the S&box skin market.",
  },
  {
    q: "How big is the S&box cosmetics market?",
    a: (
      <>
        Thousands of active listings across every tracked S&box skin and
        cosmetic. Total listings value and supply-based market cap are
        summarized on our{" "}
        <Link href="/trends" className="text-accent hover:underline">
          trends page
        </Link>
        , recalculated on every sync so you always see the current sbox market
        size.
      </>
    ),
  },
  {
    q: "Is it “sbox” or “S&box”?",
    a: "Both. Facepunch Studios officially styles the game “S&box” with the ampersand, but it's commonly written as “sbox” for convenience — our own domain, sboxskins.gg, uses the shorthand. The two spellings are used interchangeably across the community, and search engines treat them as related-but-distinct queries. Either way, we track every sbox / S&box skin regardless of how you spell it.",
  },
  {
    q: "Can I see sbox prices in my currency?",
    a: "Yes. Use the currency picker in the navbar to switch between 16 currencies — USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, SEK, NZD, MXN, SGD, HKD, KRW, INR, and BRL. Conversion uses live ECB reference rates, and your choice persists across visits. Underlying Steam Market listings are always priced in USD; the conversion is for display only.",
  },
];

/** About the S&box cosmetics market — SEO content block above the footer. */
export function AboutSection() {
  return (
    <section className="border-t border-line bg-bg2">
      <div className="mx-auto max-w-[960px] px-6 py-[54px]">
        <h2 className="mb-2 text-center font-display text-[28px] font-extrabold tracking-[-.5px] text-tx">
          About the S&box cosmetics market
        </h2>
        <p className="mb-9 text-center text-[14.5px] text-mut">
          Everything you need to know about S&box skins, cosmetics, and the Steam
          Market economy that prices them.
        </p>

        <div className="grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2">
          {QAS.map((qa) => (
            <div key={qa.q}>
              <h3 className="mb-1.5 font-display text-[16px] font-bold text-tx">
                {qa.q}
              </h3>
              <p className="text-[13.5px] leading-[1.6] text-mut">{qa.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/faq">
            <Button variant="outline" size="lg" className="gap-2">
              Read the full FAQ
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

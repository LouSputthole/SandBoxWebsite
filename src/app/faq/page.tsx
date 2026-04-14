import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ - S&box Skins",
  description:
    "Frequently asked questions about S&box skins, the Steam Community Market for S&box, skin prices, trading, and how to use sboxskins.gg.",
  alternates: { canonical: "/faq" },
};

const faqs = [
  {
    question: "What is S&box?",
    answer:
      "S&box is a sandbox game developed by Facepunch Studios, the creators of Garry's Mod and Rust. It features a community-driven marketplace where players can buy, sell, and trade cosmetic skins through the Steam Community Market.",
  },
  {
    question: "What is sboxskins.gg?",
    answer:
      "sboxskins.gg is a free price tracking and marketplace browser for S&box skins on the Steam Community Market. We track prices, show historical trends, and help you find the best deals on S&box items.",
  },
  {
    question: "How do S&box skin prices work?",
    answer:
      "S&box skins are traded on the Steam Community Market. Prices are determined by supply and demand — limited-edition and popular skins tend to be more expensive. Prices fluctuate throughout the day based on market activity.",
  },
  {
    question: "How often are prices updated?",
    answer:
      "We sync prices from the Steam Community Market multiple times per day. During peak hours (11 AM - 11 PM UTC), prices are updated every 15 minutes. During off-peak hours, prices are updated every 30 minutes. Order Book data (live buy/sell orders) is fetched directly from Steam each time you open an item page.",
  },
  {
    question: "What is the \"Lowest\" price?",
    answer:
      "The Lowest price is the cheapest currently available listing on the Steam Market. This is what you'd pay right now if you bought immediately. It's the single lowest ask from any seller.",
  },
  {
    question: "What is the \"Median\" price?",
    answer:
      "The Median price is the middle price of recent sales — half of sales closed below this, half above. It's a more stable indicator of fair value than the average because it's not skewed by extreme outliers.",
  },
  {
    question: "What is the \"Midpoint\" price?",
    answer:
      "The Midpoint is the average between the highest buy order and the lowest sell order. It's a reasonable estimate of the current fair market value — where buyers and sellers would meet in the middle.",
  },
  {
    question: "What does \"24h change\" mean?",
    answer:
      "24h change is the percentage change in current price compared to 24 hours ago. Green with an up arrow means the price rose, red with a down arrow means it fell. It gives a quick sense of short-term momentum.",
  },
  {
    question: "What is the Order Book?",
    answer:
      "The Order Book is a live snapshot of every active buy and sell order on the Steam Market for an item. It shows what buyers are offering to pay and what sellers are asking, at every price level. We fetch it directly from Steam each time you load the page, so it's always current.",
  },
  {
    question: "What is a \"Buy Order\"?",
    answer:
      "A buy order is someone offering to purchase an item at a specific price. Instead of buying immediately at the current sell price, buyers can place an order at a lower price and wait for the market to drop. Sellers can choose to sell into these orders for instant liquidity.",
  },
  {
    question: "What is a \"Sell Order\" (Listing)?",
    answer:
      "A sell order is an item actively for sale at a specific price. When you buy an item, you're purchasing from the lowest-priced sell order. Higher-priced sell orders only fill after the lower ones sell out.",
  },
  {
    question: "What is the \"Highest Buy Order\"?",
    answer:
      "The most anyone is currently offering to pay for the item. If you list your item at or below this price, it sells instantly to that buyer. This price represents immediate demand from the market.",
  },
  {
    question: "What is the \"Lowest Sell Order\"?",
    answer:
      "The cheapest listing currently available on the market. It's what you'd pay if you bought one right now. Place a buy order at or above this and you purchase instantly.",
  },
  {
    question: "What is \"Buy Depth\"?",
    answer:
      "Buy depth is the total number of people currently waiting to buy this item across all price levels. High buy depth means strong demand — if prices drop, many buyers are ready to purchase. Low buy depth suggests weak demand or a thinly-traded item.",
  },
  {
    question: "What is \"Sell Depth\"?",
    answer:
      "Sell depth is the total number of individual items currently for sale. This can be higher than the \"Listings\" count because one seller can list multiple copies in a single listing. Sell depth represents the total supply available to buy right now.",
  },
  {
    question: "What is the \"Spread\"?",
    answer:
      "The spread is the gap between the lowest sell price (ask) and the highest buy price (bid). A narrow spread means the market is liquid and prices are tight — easy to buy and sell near market rate. A wide spread indicates illiquidity, where buying and immediately reselling would cost you a significant amount.",
  },
  {
    question: "What is \"Near Buy/Sell Depth\"?",
    answer:
      "A focused view of liquidity. \"Near Buy Depth\" counts items buyers want within 10% of the midpoint price. \"Near Sell Depth\" counts items sellers are offering within 10% of the midpoint. High values in both = healthy, active market. Imbalance in either direction can signal price pressure.",
  },
  {
    question: "Why are \"Listings\" and \"Sell Orders\" different numbers?",
    answer:
      "\"Listings\" is the number of distinct seller entries on Steam's market search. \"Sell Orders\" (or Sell Depth) is the total individual items for sale. Steam lets one seller list multiple identical items in a single listing — so 12 listings might represent 55 actual items. Steam's search API returns the listing count; the live order book returns the item count.",
  },
  {
    question: "What is \"Total Supply\"?",
    answer:
      "Total supply is the number of this item that has ever been minted across the entire S&box economy. We track this via sbox.game's skin metrics page. Lower supply usually correlates with higher scarcity and price. Some items aren't tracked by sbox.game and will show as N/A.",
  },
  {
    question: "Why do some items show \"N/A\" for supply?",
    answer:
      "Supply data comes from sbox.game/metrics/skins, which only lists a subset of all S&box items (currently around 30). Items from older events or not currently tracked by sbox.game show N/A. This doesn't mean they're worthless — it just means we don't have mint count data for them.",
  },
  {
    question: "What does \"Store Status\" mean?",
    answer:
      "Store status tells you whether an item is still available for purchase from the in-game S&box store (\"Available\"), has been removed from the store (\"Delisted\"), or hasn't been checked (\"Unknown\"). Delisted items often become more valuable over time as no new copies can be purchased directly.",
  },
  {
    question: "What does \"Bullish Pressure\" mean?",
    answer:
      "Bullish pressure appears when there's significantly more buy interest than sell interest in the order book, and the spread is reasonable. It suggests demand is outpacing supply, and the price may move upward as buyers compete.",
  },
  {
    question: "What does \"Bearish Pressure\" mean?",
    answer:
      "Bearish pressure appears when sell orders heavily outweigh buy orders. Supply is outpacing demand, and the price may face downward movement as sellers compete to offload inventory.",
  },
  {
    question: "What does \"Low Liquidity\" mean?",
    answer:
      "Low liquidity means the spread between the highest buy and lowest sell is very wide (typically over 20%). Few people are actively trading the item. Prices can be volatile, and you may pay a steep premium to buy or accept a big discount to sell quickly.",
  },
  {
    question: "What is \"Volume\"?",
    answer:
      "Volume refers to how many items have been sold over a recent period (typically 24 hours). High volume means an active market with lots of trading. Low volume can indicate a niche item — be careful making assumptions about fair price when few trades are happening.",
  },
  {
    question: "What types of skins are available in S&box?",
    answer:
      "S&box features several types of cosmetic items: Character skins (full player models), Clothing (wearable outfits and accessories), Weapons (weapon skins), Accessories (decorative add-ons), and Tools (tool reskins).",
  },
  {
    question: "How do I buy S&box skins?",
    answer:
      "You can buy S&box skins directly through the Steam Community Market. Find the item you want on sboxskins.gg, click 'View on Steam Market', and complete your purchase through Steam. You'll need a Steam account with S&box in your library.",
  },
  {
    question: "Can I set price alerts for S&box skins?",
    answer:
      "Yes! On any item page on sboxskins.gg, you can set a price alert. Enter your email, choose whether you want to be notified when the price drops below or rises above a target, and we'll notify you when it happens.",
  },
  {
    question: "Are S&box skins a good investment?",
    answer:
      "Skin prices depend on market demand and game popularity. Limited-edition skins have historically held or increased in value, but past performance doesn't guarantee future results. Use our price history charts to make informed decisions.",
  },
  {
    question: "How do I sell S&box skins?",
    answer:
      "To sell S&box skins, go to your Steam Inventory, select the item you want to sell, and list it on the Steam Community Market. You can check current market prices on sboxskins.gg to price your item competitively.",
  },
  {
    question: "Is signing in with Steam safe?",
    answer:
      "Yes. We use Steam's official OpenID 2.0 protocol — the same used by trusted community sites like SteamDB, backpack.tf, and CSGOStash. When you click \"Sign in with Steam\", you are redirected to Steam's website to log in. We never see your password and we never receive any access to your Steam account. We cannot view your inventory, send trade offers, make purchases, or do anything to your account. The only information we receive is your public Steam ID (a number anyone can look up). Signing in is completely optional — it just lets you sync your watchlist across devices.",
  },
  {
    question: "What data do you store when I sign in?",
    answer:
      "When you sign in with Steam, we store your public Steam ID, display name, and profile avatar — all of which are publicly visible on your Steam profile already. We also store your watchlist items server-side so they sync across devices. We do not store your password, email, or any private account information. You can sign out at any time, and your account data can be deleted on request.",
  },
];

export default function FAQPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
      { "@type": "ListItem", position: 2, name: "FAQ", item: "https://sboxskins.gg/faq" },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-neutral-500 mb-6" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-white">FAQ</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-bold text-white mb-2">Frequently Asked Questions</h1>
        <p className="text-neutral-400 mb-10">
          Everything you need to know about S&box skins, prices, and trading on the Steam Community Market.
        </p>

        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden"
              {...(i === 0 ? { open: true } : {})}
            >
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-white font-medium hover:bg-neutral-800/50 transition-colors">
                <span>{faq.question}</span>
                <span className="ml-4 text-neutral-500 group-open:rotate-45 transition-transform text-xl">+</span>
              </summary>
              <div className="px-6 pb-5 text-sm text-neutral-400 leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center border-t border-neutral-800 pt-10">
          <p className="text-neutral-400 mb-4">Ready to start tracking S&box skin prices?</p>
          <Link
            href="/items"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Browse All Skins
          </Link>
        </div>
      </div>
    </>
  );
}

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
      "S&box skins are traded on the Steam Community Market. Prices are determined by supply and demand — rarer items and limited-edition skins tend to be more expensive. Prices fluctuate throughout the day based on market activity.",
  },
  {
    question: "How often are prices updated?",
    answer:
      "We sync prices from the Steam Community Market multiple times per day. During peak hours (11 AM - 11 PM EST), prices are updated every 15 minutes. During off-peak hours, prices are updated every 30 minutes.",
  },
  {
    question: "What skin rarities exist in S&box?",
    answer:
      "S&box skins come in four rarity tiers: Common, Uncommon, Rare, and Legendary. Legendary skins are the rarest and most valuable, while Common skins are the most affordable and widely available.",
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
      "Skin prices depend on market demand, rarity, and game popularity. Limited-edition and legendary skins have historically held or increased in value, but past performance doesn't guarantee future results. Use our price history charts to make informed decisions.",
  },
  {
    question: "How do I sell S&box skins?",
    answer:
      "To sell S&box skins, go to your Steam Inventory, select the item you want to sell, and list it on the Steam Community Market. You can check current market prices on sboxskins.gg to price your item competitively.",
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

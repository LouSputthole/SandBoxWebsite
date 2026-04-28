import { InventoryChecker } from "./inventory-checker";

/**
 * Inventory page is a server-component shell that mounts the existing
 * client widget + ships SEO copy below the fold. Without the copy,
 * Googlebot sees only the metadata + a "use client" interactive shell
 * with no indexable text — Search Console reports the page as "Crawled
 * - currently not indexed" because the visible content doesn't justify
 * inclusion. The FAQ + explainer block here gives crawlers something
 * substantive to weight while keeping the original UX untouched.
 */
export default function InventoryPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How do I check the value of my S&box inventory?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Paste your Steam profile URL or your 17-digit SteamID64 into the box above. We fetch your public S&box inventory from Steam, match each item against our catalog, and show the total estimated value at current Steam Community Market prices.",
        },
      },
      {
        "@type": "Question",
        name: "Does my Steam profile have to be public?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Your Steam inventory has to be set to public for Steam to share it with anyone — including this tool. If the lookup fails with an empty result, open your Steam profile privacy settings and switch \"Inventory\" to Public, then try again.",
        },
      },
      {
        "@type": "Question",
        name: "How accurate is the inventory value estimate?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Each item is priced at the current Steam Community Market median for that hash name. That's the realistic price you'd net selling to other Steam users today, before Steam's marketplace fees (~15%). Items not in our catalog yet show as untracked and don't contribute to the total.",
        },
      },
      {
        "@type": "Question",
        name: "Do you store my Steam ID or inventory data?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. We pass the SteamID64 to Steam's public inventory endpoint server-side and discard it after the response is matched against our catalog. Nothing about your inventory is written to our database.",
        },
      },
      {
        "@type": "Question",
        name: "Can I check someone else's inventory?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes — paste any Steam profile URL or vanity URL. As long as the target inventory is public, the tool works. This is useful for evaluating trade-partner offers or scouting whales before approaching them.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <InventoryChecker />

      {/* SEO content. Server-rendered so Googlebot sees real text on the
          first paint, addressing the "Crawled - currently not indexed"
          status from Search Console. Below the interactive widget so
          regular users hit the lookup form first. */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-16 pt-4 prose prose-invert prose-sm max-w-none">
        <h2 className="text-xl font-bold text-white mb-3">
          About the S&amp;box inventory checker
        </h2>
        <p className="text-sm text-neutral-400 leading-relaxed">
          This tool calculates the total Steam Community Market value of any
          public S&amp;box inventory. Paste a Steam profile URL or a 17-digit
          SteamID64 and we&apos;ll pull the inventory, match each item against
          our live price catalog, and show a per-item breakdown plus the total
          estimated value. There&apos;s no signup required for lookups,
          although signing in with Steam lets you check your own inventory in
          one click.
        </p>

        <h3 className="text-base font-semibold text-white mt-6 mb-2">
          What we show per item
        </h3>
        <ul className="text-sm text-neutral-400 leading-relaxed list-disc pl-5 space-y-1">
          <li>
            Quantity owned in the inventory (Steam aggregates duplicates)
          </li>
          <li>
            Current Steam Market price per unit, updated from our catalog
          </li>
          <li>Per-line subtotal (quantity × unit price)</li>
          <li>
            Marketability flag — items that are tradeable but not
            marketable show separately
          </li>
        </ul>

        <h3 className="text-base font-semibold text-white mt-6 mb-2">
          Privacy and limitations
        </h3>
        <p className="text-sm text-neutral-400 leading-relaxed">
          The lookup proxies Steam&apos;s public inventory endpoint. Your
          Steam ID is sent to Steam (because that&apos;s how the request
          works), but nothing about the inventory is written to our database
          — the response is parsed in-memory and rendered to you only. We
          rate-limit lookups per IP so the tool stays available during
          traffic spikes.
        </p>
        <p className="text-sm text-neutral-400 leading-relaxed mt-3">
          Items released too recently to be in our catalog show as untracked
          and don&apos;t contribute to the total. The catalog refreshes
          daily, so brand-new drops typically appear within 24 hours of
          release.
        </p>

        <h3 className="text-base font-semibold text-white mt-6 mb-2">
          Frequently asked
        </h3>
        <dl className="text-sm leading-relaxed space-y-3">
          <div>
            <dt className="text-white font-semibold">
              Why does the lookup say my inventory is empty?
            </dt>
            <dd className="text-neutral-400 mt-1">
              Steam returns an empty response when an inventory is set to
              private. Open Steam → your profile → Edit Profile → Privacy
              Settings → set Inventory to Public, then retry.
            </dd>
          </div>
          <div>
            <dt className="text-white font-semibold">
              How does this differ from Steam&apos;s built-in inventory page?
            </dt>
            <dd className="text-neutral-400 mt-1">
              Steam shows you items but no totals or market context. We add
              the per-item current price, a running total, and links into
              each item&apos;s price history page so you can see whether
              specific holdings are worth keeping, listing, or watching.
            </dd>
          </div>
          <div>
            <dt className="text-white font-semibold">
              Can I export my inventory valuation?
            </dt>
            <dd className="text-neutral-400 mt-1">
              Not yet from this page. The CSV export at <code>/api/export</code>
              {" "}
              covers the full catalog with prices and supply, which lets you
              build your own per-item value sheet in a spreadsheet.
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

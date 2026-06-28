import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactForm } from "./_components/contact-form";

export const metadata: Metadata = {
  title: "Contact - S&box Skins",
  description:
    "Get in touch with sboxskins.gg. Email us with bug reports, feature requests, partnership inquiries, or any questions about S&box skins and the Steam Community Market.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact sboxskins.gg",
    description:
      "Email us with bug reports, feature requests, or partnership inquiries. We read every message.",
    type: "website",
    url: "https://sboxskins.gg/contact",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://sboxskins.gg" },
    { "@type": "ListItem", position: 2, name: "Contact", item: "https://sboxskins.gg/contact" },
  ],
};

const contactPageLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact sboxskins.gg",
  url: "https://sboxskins.gg/contact",
  description: "Contact information for sboxskins.gg — the S&box skin price tracker.",
};

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageLd) }}
      />
      <div className="mx-auto max-w-[820px] px-6 py-[42px]">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-mut" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="transition-colors hover:text-tx">
                Home
              </Link>
            </li>
            <li>/</li>
            <li className="text-tx">Contact</li>
          </ol>
        </nav>

        {/* Centered header */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-[42px] font-extrabold tracking-[-0.02em] text-tx">
            Get in touch
          </h1>
          <p className="mx-auto mt-2.5 max-w-xl text-[15px] text-mut">
            Questions, bug reports, feature requests, or partnership ideas — we
            want to hear from you.
          </p>
        </div>

        {/* Arcade contact card */}
        <ContactForm
          showEmail
          title="Send us a message"
          description="Best for detailed questions, bug reports with screenshots, or anything that needs a longer conversation. We read every message."
        />

        {/* What to reach out about */}
        <div className="mt-8 rounded-[18px] border border-line bg-panel p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="rounded-[12px] border border-line bg-bg2 p-2.5">
              <MessageSquareText className="h-5 w-5 text-mut" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-tx">
                What should you reach out about?
              </h2>
              <p className="mt-1 text-sm text-faint">Anything, but especially these:</p>
            </div>
          </div>

          <ul className="space-y-3 text-sm leading-relaxed">
            <li className="flex gap-3">
              <span className="shrink-0 font-semibold text-accent">Bug reports</span>
              <span className="text-mut">
                — if something looks wrong, prices aren&apos;t updating, or the site is broken.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-semibold text-accent">Missing items</span>
              <span className="text-mut">
                — tell us if you find an S&box skin that isn&apos;t showing up.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-semibold text-accent">Feature requests</span>
              <span className="text-mut">
                — what would make sboxskins.gg more useful to you?
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-semibold text-accent">Partnerships</span>
              <span className="text-mut">
                — content collabs, backlink exchanges, data sharing, sponsorships.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-semibold text-accent">Data questions</span>
              <span className="text-mut">
                — how we source prices, supply data, or anything you see on the site.
              </span>
            </li>
          </ul>
        </div>

        {/* FAQ callout */}
        <div className="mt-8 border-t border-line pt-10 text-center">
          <p className="mb-4 text-mut">
            Have a common question? The answer might already be in our FAQ.
          </p>
          <Link href="/faq">
            <Button variant="outline" className="gap-2">
              Browse the FAQ
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquareText, ArrowRight, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const EMAIL = "sboxskinsgg@gmail.com";
const TWITTER = "SboxSkinsgg";

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
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Breadcrumb */}
      <nav className="text-sm text-neutral-500 mb-6" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
          </li>
          <li>/</li>
          <li className="text-white">Contact</li>
        </ol>
      </nav>

      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-3">Get in touch</h1>
        <p className="text-neutral-400 max-w-xl mx-auto">
          Questions, bug reports, feature requests, or partnership ideas — we want to hear from you.
        </p>
      </div>

      {/* Primary contact — Email card */}
      <a
        href={`mailto:${EMAIL}`}
        className="group block rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent p-8 mb-6 transition hover:border-purple-500/60"
      >
        <div className="flex items-start gap-5">
          <div className="p-3 rounded-xl bg-purple-500/15 flex-shrink-0">
            <Mail className="h-6 w-6 text-purple-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Email us</h2>
              <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-purple-300 transition" />
            </div>
            <p className="text-sm text-neutral-400 mb-3">
              Best for detailed questions, bug reports with screenshots, or anything that needs
              a longer conversation. We read every message.
            </p>
            <div className="font-mono text-base text-purple-300 break-all">{EMAIL}</div>
          </div>
        </div>
      </a>

      {/* Secondary: Twitter/X */}
      <a
        href={`https://x.com/${TWITTER}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group block rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 mb-6 transition hover:border-neutral-700"
      >
        <div className="flex items-start gap-5">
          <div className="p-3 rounded-xl bg-neutral-800 flex-shrink-0">
            <AtSign className="h-6 w-6 text-neutral-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Follow on X</h2>
              <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white transition" />
            </div>
            <p className="text-sm text-neutral-400 mb-3">
              For quick questions, market takes, and updates on new features.
            </p>
            <div className="font-mono text-base text-neutral-300">@{TWITTER}</div>
          </div>
        </div>
      </a>

      {/* What to reach out about */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 mb-12">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-2.5 rounded-xl bg-neutral-800">
            <MessageSquareText className="h-5 w-5 text-neutral-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">
              What should you reach out about?
            </h2>
            <p className="text-sm text-neutral-500">Anything, but especially these:</p>
          </div>
        </div>

        <ul className="space-y-3 text-sm text-neutral-300 leading-relaxed">
          <li className="flex gap-3">
            <span className="text-purple-400 font-semibold shrink-0">Bug reports</span>
            <span className="text-neutral-400">
              — if something looks wrong, prices aren&apos;t updating, or the site is broken.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-purple-400 font-semibold shrink-0">Missing items</span>
            <span className="text-neutral-400">
              — tell us if you find an S&box skin that isn&apos;t showing up.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-purple-400 font-semibold shrink-0">Feature requests</span>
            <span className="text-neutral-400">
              — what would make sboxskins.gg more useful to you?
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-purple-400 font-semibold shrink-0">Partnerships</span>
            <span className="text-neutral-400">
              — content collabs, backlink exchanges, data sharing, sponsorships.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-purple-400 font-semibold shrink-0">Data questions</span>
            <span className="text-neutral-400">
              — how we source prices, supply data, or anything you see on the site.
            </span>
          </li>
        </ul>
      </div>

      {/* FAQ callout */}
      <div className="text-center border-t border-neutral-800 pt-10">
        <p className="text-neutral-400 mb-4">
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

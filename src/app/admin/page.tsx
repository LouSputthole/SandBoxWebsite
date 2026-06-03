import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  HardDrive,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  ChevronRight,
  Sprout,
  Bug,
  GitMerge,
  Tag,
  Hash,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

interface AdminPage {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const PAGES: AdminPage[] = [
  {
    href: "/admin/analytics",
    label: "Analytics",
    description:
      "Pageviews, sessions, top pages, referrers, and the referring-URL detail card.",
    icon: BarChart3,
  },
  {
    href: "/admin/tweet",
    label: "Tweets",
    description:
      "Draft + post tweets, reply to mentions, schedule with quick offsets, tone + item picker.",
    icon: Send,
  },
  {
    href: "/admin/tweet/stats",
    label: "Tweet stats",
    description: "Sent-tweet log with per-kind counts and recent failures.",
    icon: MessageCircle,
  },
  {
    href: "/admin/reddit",
    label: "Reddit",
    description:
      "Reddit-style draft generator (weekly analysis, spotlight, scarcity, whales) with subreddit risk ratings.",
    icon: MessageSquare,
  },
  {
    href: "/admin/newsletter",
    label: "Newsletter",
    description:
      "Subscriber list, manual verify/unsub, fan-out buttons for Friday wrap + Monday outlook.",
    icon: Mail,
  },
  {
    href: "/admin/storage",
    label: "Storage",
    description:
      "Per-table sizes, projected growth, dry-run + live downsampler and PageView rollup.",
    icon: HardDrive,
  },
  {
    href: "/admin/seed-item",
    label: "Seed missing item",
    description:
      "Force-add a catalog gap (e.g. Hard Hat) by name or sbox.dev URL. Tries Steam Market then falls back to sbox.dev.",
    icon: Sprout,
  },
  {
    href: "/admin/merge-orphan-items",
    label: "Merge orphan items",
    description:
      "Fold phantom Steam-row dupes into matching sbox-row originals. Auto-pairs by name; manual pair-by-id for items where sbox.dev and Steam disagree on the display name (e.g. Cat Balaclava ↔ Toothpick).",
    icon: GitMerge,
  },
  {
    href: "/admin/relabel-item",
    label: "Relabel item",
    description:
      "Rename + reslug a single Item row by id. Use to undo a wrong merge (e.g. Brown Leather Coat row ended up holding the Leather Coat Steam data).",
    icon: Tag,
  },
  {
    href: "/admin/scrape-nameids",
    label: "Scrape order-book nameids",
    description:
      "Manually trigger the daily cron that fills steamItemNameId for items missing it. Required before the buy/sell order book renders on item pages.",
    icon: Hash,
  },
  {
    href: "/admin/set-nameid",
    label: "Set item nameid",
    description:
      "Manually set steamItemNameId for one item by slug (with a worklist of items still missing it). For when the scrape cron can't fetch a nameid and you grab it by hand from a logged-in Steam Market page.",
    icon: Hash,
  },
  {
    href: "/admin/debug",
    label: "Debug",
    description:
      "Run sbox.dev / sbox.game diagnostic endpoints from the browser. Mobile-friendly, with a Copy button on the JSON output.",
    icon: Bug,
  },
];

export default function AdminIndexPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Each destination has its own admin-key gate.
        </p>
      </div>

      <div className="space-y-2">
        {PAGES.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 transition hover:border-purple-500/40 hover:bg-neutral-900/80"
          >
            <Icon className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{label}</p>
                <span className="font-mono text-[11px] text-neutral-600 truncate">
                  {href}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                {description}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-700 shrink-0 mt-1 transition group-hover:text-purple-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}

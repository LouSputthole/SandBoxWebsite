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

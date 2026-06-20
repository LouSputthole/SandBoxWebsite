"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/claudebridge", label: "Overview" },
  { href: "/claudebridge/plugin", label: "Plugin" },
  { href: "/claudebridge/changelog", label: "Changelog" },
  { href: "/claudebridge/troubleshooting", label: "Troubleshooting" },
  { href: "/claudebridge/faq", label: "FAQ" },
];

export function ClaudeBridgeNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-10 flex flex-wrap gap-x-1 gap-y-1 border-b border-neutral-800" aria-label="Claude Bridge sections">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-purple-500 text-white"
                : "border-transparent text-neutral-400 hover:border-neutral-700 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

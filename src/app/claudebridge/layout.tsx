import type { Metadata } from "next";
import Link from "next/link";
import { ClaudeBridgeNav } from "@/components/claudebridge/section-nav";

export const metadata: Metadata = {
  title: {
    default: "Claude Bridge for s&box — build games by talking to Claude",
    template: "%s · Claude Bridge",
  },
  description:
    "Claude Bridge for s&box lets an AI work inside your s&box editor — writing scripts, building scenes, wiring components, and whole game systems. Docs, plugin guide, changelog, and troubleshooting.",
};

export default function ClaudeBridgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <nav className="mb-6 text-sm text-neutral-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors hover:text-white">
              Home
            </Link>
          </li>
          <li>/</li>
          <li className="text-white">Claude Bridge</li>
        </ol>
      </nav>
      <ClaudeBridgeNav />
      {children}
    </div>
  );
}

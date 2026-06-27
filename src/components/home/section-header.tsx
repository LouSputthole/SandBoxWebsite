import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional leading icon rendered next to the heading. */
  icon?: ReactNode;
  /** Optional right-aligned "view all" style link. */
  link?: { href: string; label: string };
}

/**
 * The repeated section header used across the homepage: a Bricolage 800
 * heading (with optional leading icon) + a muted subtitle on the left and an
 * optional muted "view all →" link on the right.
 */
export function SectionHeader({ title, subtitle, icon, link }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 font-display text-[30px] font-extrabold leading-tight tracking-[-.6px] text-tx">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-[14.5px] text-mut">{subtitle}</p>}
      </div>
      {link && (
        <Link
          href={link.href}
          className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-mut transition-colors hover:text-tx"
        >
          {link.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

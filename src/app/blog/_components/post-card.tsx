import type { CSSProperties } from "react";
import Link from "next/link";
import { Sparkline } from "@/components/charts";
import { getTagMeta, decorativeSeries, formatPostDate } from "./post-meta";

export interface PostCardData {
  slug: string;
  title: string;
  excerpt: string;
  kind: string | null;
  publishedAt: Date;
}

/**
 * A single report in the 3-col grid: tag-tinted chart header (decorative
 * <Sparkline>), color-coded tag eyebrow, display title, excerpt, date.
 * Lifts + brightens its border to the tag color on hover.
 */
export function PostCard({ post }: { post: PostCardData }) {
  const tag = getTagMeta(post.kind);
  const series = decorativeSeries(post.slug);

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block overflow-hidden rounded-[18px] border border-line bg-panel transition-[transform,border-color] duration-150 hover:-translate-y-1 hover:[border-color:color-mix(in_srgb,var(--tag-color)_45%,var(--line))]"
      style={{ "--tag-color": tag.color } as CSSProperties}
    >
      <div
        className="flex h-[120px] items-center justify-center border-b border-line2"
        style={{
          background: `radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, ${tag.color} 26%, transparent), var(--panel2) 64%)`,
        }}
      >
        <Sparkline
          data={series}
          color={tag.color}
          width={232}
          height={60}
          strokeWidth={2}
        />
      </div>
      <div className="px-[18px] pb-[18px] pt-4">
        <span
          className="font-mono text-[10.5px] font-bold uppercase tracking-[0.4px]"
          style={{ color: tag.color }}
        >
          {tag.label}
        </span>
        <h3 className="mt-2 mb-2 font-display text-[16.5px] font-bold leading-[1.25] text-tx">
          {post.title}
        </h3>
        <p className="m-0 mb-3 line-clamp-2 text-[12.5px] leading-[1.55] text-mut">
          {post.excerpt}
        </p>
        <div className="font-mono text-[11.5px] text-faint">
          {formatPostDate(post.publishedAt)}
        </div>
      </div>
    </Link>
  );
}

import type { CSSProperties } from "react";
import Link from "next/link";
import { AreaChart } from "@/components/charts";
import { getTagMeta, decorativeSeries, formatPostDate } from "./post-meta";

export interface FeaturedPostData {
  slug: string;
  title: string;
  excerpt: string;
  kind: string | null;
  publishedAt: Date;
}

/**
 * The hero "featured" report — a 2-column card: copy on the left
 * (tag chip, big display title, excerpt, date), an accent-tinted
 * chart-art panel on the right (decorative <AreaChart>).
 */
export function FeaturedPost({ post }: { post: FeaturedPostData }) {
  const tag = getTagMeta(post.kind);
  const series = decorativeSeries(post.slug, 14).map((v, i) => ({ t: i, v }));

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="mb-8 grid grid-cols-1 overflow-hidden rounded-[20px] border border-line bg-panel transition-colors duration-150 hover:[border-color:color-mix(in_srgb,var(--tag-color)_45%,var(--line))] md:grid-cols-[1.1fr_1fr]"
      style={{ "--tag-color": tag.color } as CSSProperties}
    >
      <div className="p-7 sm:p-8">
        <span
          className="inline-block rounded-[8px] px-[11px] py-1 font-mono text-[11px] font-bold uppercase tracking-[0.5px]"
          style={{
            color: tag.color,
            background: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
          }}
        >
          {tag.label}
        </span>
        <h2 className="mt-4 mb-3 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.5px] text-tx sm:text-[28px]">
          {post.title}
        </h2>
        <p className="m-0 mb-5 text-[14px] leading-[1.6] text-mut">
          {post.excerpt}
        </p>
        <div className="flex items-center gap-2.5 font-mono text-[12.5px] text-faint">
          <span>{formatPostDate(post.publishedAt)}</span>
        </div>
      </div>

      <div
        className="relative flex min-h-[200px] items-center justify-center border-t border-line2 md:border-l md:border-t-0"
        style={{
          background: `radial-gradient(120% 100% at 70% 20%, color-mix(in srgb, ${tag.color} 30%, transparent), var(--panel2) 60%)`,
        }}
      >
        <div className="w-[82%] py-6">
          <AreaChart
            series={series}
            color={tag.color}
            height={170}
            grid={false}
          />
        </div>
      </div>
    </Link>
  );
}

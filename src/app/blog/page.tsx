import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Newspaper } from "lucide-react";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "S&box Market Reports & Analysis",
  description:
    "Weekly market reports, analysis, and news for the S&box skin economy. Data-driven takes on price trends, top movers, and scarcity.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndexPage() {
  const posts = await prisma.blogPost.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      slug: true,
      title: true,
      excerpt: true,
      kind: true,
      publishedAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Newspaper className="h-5 w-5 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Market Reports</h1>
        </div>
        <p className="text-sm text-neutral-400">
          Weekly analysis of the S&box skin market. Top movers, scarcity trends, and what it all means.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-12 text-center">
          <p className="text-sm text-neutral-500">
            First report drops this Friday. Come back soon.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block rounded-xl border border-neutral-800 bg-neutral-900/30 p-5 hover:bg-neutral-800/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2 text-[11px] text-neutral-500">
                <span>{post.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                {post.kind && (
                  <>
                    <span>·</span>
                    <span className="uppercase tracking-wider">{post.kind.replace("-", " ")}</span>
                  </>
                )}
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">{post.title}</h2>
              <p className="text-sm text-neutral-400 line-clamp-2">{post.excerpt}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

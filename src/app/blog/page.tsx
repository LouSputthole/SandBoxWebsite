import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { FeaturedPost } from "./_components/featured-post";
import { PostCard } from "./_components/post-card";
import { NewsletterStrip } from "./_components/newsletter-strip";

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

  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto max-w-[1140px] px-6 pb-12 pt-9">
      {/* header */}
      <div className="mb-6">
        <h1 className="m-0 font-display text-[38px] font-extrabold tracking-[-0.02em] text-tx">
          Market reports
        </h1>
        <p className="mt-2 text-[14.5px] text-mut">
          Signal-driven analysis of the S&box skin market — momentum, movers and
          the stories behind the prices.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-[20px] border border-line bg-panel p-12 text-center">
          <p className="text-[14px] text-faint">
            First report drops this Friday. Come back soon.
          </p>
        </div>
      ) : (
        <>
          {featured && <FeaturedPost post={featured} />}

          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </>
      )}

      <NewsletterStrip />
    </div>
  );
}

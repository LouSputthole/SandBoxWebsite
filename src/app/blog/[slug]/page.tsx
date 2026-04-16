import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ArrowLeft } from "lucide-react";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.publishedAt.toISOString(),
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        All reports
      </Link>

      <article>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 text-[11px] text-neutral-500">
            <span>
              {post.publishedAt.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {post.kind && (
              <>
                <span>·</span>
                <span className="uppercase tracking-wider">{post.kind.replace("-", " ")}</span>
              </>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">{post.title}</h1>
          <p className="text-lg text-neutral-400">{post.excerpt}</p>
        </div>

        <div className="max-w-none">{renderMarkdown(post.content)}</div>
      </article>
    </div>
  );
}

/**
 * Minimal markdown → React renderer. Supports headings, bold, italics,
 * links, numbered lists, horizontal rules, and paragraphs. Built as JSX
 * (not innerHTML) to avoid any XSS risk from the auto-generated content.
 */
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushPara = () => {
    if (paragraph.length > 0) {
      blocks.push(
        <p key={blocks.length} className="text-neutral-300 leading-relaxed mb-4">
          {renderInline(paragraph.join(" "))}
        </p>,
      );
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ol key={blocks.length} className="list-decimal list-inside space-y-1 mb-4 text-neutral-300">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      listItems = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line === "---") {
      flushPara();
      flushList();
      blocks.push(<hr key={blocks.length} className="border-neutral-800 my-8" />);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      flushList();
      blocks.push(
        <h2 key={blocks.length} className="text-xl font-semibold text-white mt-8 mb-3">
          {renderInline(line.slice(3))}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      flushList();
      blocks.push(
        <h1 key={blocks.length} className="text-2xl font-bold text-white mt-8 mb-3">
          {renderInline(line.slice(2))}
        </h1>,
      );
      continue;
    }
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      flushPara();
      listItems.push(olMatch[2]);
      continue;
    }
    if (line.startsWith("_") && line.endsWith("_")) {
      flushPara();
      flushList();
      blocks.push(
        <p key={blocks.length} className="text-xs text-neutral-600 italic">
          {renderInline(line.slice(1, -1))}
        </p>,
      );
      continue;
    }
    paragraph.push(line);
  }
  flushPara();
  flushList();

  return <>{blocks}</>;
}

/**
 * Inline markdown via matchAll — handles **bold**, _italic_, and
 * [label](url) as JSX (no innerHTML) so React escapes everything.
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|_(.+?)_|\[(.+?)\]\((.+?)\)/g;
  const matches = Array.from(text.matchAll(pattern));

  let lastIndex = 0;
  let key = 0;

  for (const m of matches) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }
    if (m[1] !== undefined) {
      parts.push(
        <strong key={key++} className="text-white">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      parts.push(<em key={key++}>{m[2]}</em>);
    } else if (m[3] !== undefined && m[4] !== undefined) {
      parts.push(
        <Link key={key++} href={m[4]} className="text-cyan-400 hover:text-cyan-300">
          {m[3]}
        </Link>,
      );
    }
    lastIndex = start + m[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

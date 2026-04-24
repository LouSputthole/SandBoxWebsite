import { prisma } from "@/lib/db";

/**
 * Build the "anti-duplication" context we feed Claude on every report.
 * Without this, consecutive Friday reports reuse the same phrasing and
 * the same narrative angles ("a correction week…", "holders stayed
 * patient…") — the newsletter reads like Mad Libs.
 *
 * We pull the last N reports, yank out the title + excerpt + a short
 * fingerprint of which items were called out, and hand it to Claude as
 * "here's what you said recently — pick a different angle, reference a
 * different set of items if the signals allow."
 */

export interface PriorReport {
  title: string;
  excerpt: string;
  publishedAt: Date;
  kind: string | null;
  /** Slugs of items linked from the body — gives Claude a hit-list of
   *  things to de-emphasize this issue unless the signals are too
   *  strong to ignore. */
  spotlightedSlugs: string[];
  /** First 600 chars of body so Claude can detect tone/phrasing
   *  patterns and avoid echoing them. */
  bodyPreview: string;
}

export async function getPriorReports(
  limit = 4,
  kinds: string[] = ["weekly-report", "monday-outlook"],
): Promise<PriorReport[]> {
  const rows = await prisma.blogPost.findMany({
    where: { kind: { in: kinds } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      title: true,
      excerpt: true,
      content: true,
      publishedAt: true,
      kind: true,
    },
  });

  return rows.map((r) => {
    const slugs = new Set<string>();
    for (const m of r.content.matchAll(/\/items\/([a-z0-9-]+)/g)) {
      slugs.add(m[1]);
    }
    return {
      title: r.title,
      excerpt: r.excerpt,
      publishedAt: r.publishedAt,
      kind: r.kind,
      spotlightedSlugs: Array.from(slugs),
      bodyPreview: r.content.slice(0, 600),
    };
  });
}

/**
 * Format prior reports as a compact block suitable for dropping into a
 * Claude system prompt. Keeps it short — we're not trying to teach
 * Claude the full archive, just signal "don't repeat yourself."
 */
export function formatPriorReportsContext(reports: PriorReport[]): string {
  if (reports.length === 0) {
    return "No prior reports exist yet — you have a clean slate.";
  }
  const lines = reports.map((r, i) => {
    const when = r.publishedAt.toISOString().slice(0, 10);
    const slugs =
      r.spotlightedSlugs.length > 0
        ? r.spotlightedSlugs.slice(0, 8).join(", ")
        : "(none)";
    return [
      `Report ${i + 1} — ${r.kind ?? "post"} · ${when}`,
      `  Title: ${r.title}`,
      `  Excerpt: ${r.excerpt}`,
      `  Items already spotlighted: ${slugs}`,
      `  Opening: ${r.bodyPreview.slice(0, 240).replace(/\n+/g, " ")}`,
    ].join("\n");
  });
  return lines.join("\n\n");
}

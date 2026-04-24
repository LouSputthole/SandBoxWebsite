import { callClaude } from "@/lib/anthropic/client";
import {
  formatPriorReportsContext,
  getPriorReports,
  type PriorReport,
} from "./prior-reports";

/**
 * Claude-written narrative passages for the Friday wrap-up and Monday
 * outlook newsletters. Each helper returns either Claude's text or
 * `null` (missing key, API error, empty output) — callers handle null
 * by falling back to a flat template so a broken Anthropic key never
 * kills the whole cron.
 *
 * Tone target: "Wendy's Twitter for skin markets." Concise, casual,
 * occasionally dry. Never markety. The system prompt also tells Claude
 * to avoid phrasing from the prior reports passed in, which is what
 * keeps four weeks of issues from sounding like the same Mad Libs.
 */

const SYSTEM_FRIDAY = `
You are the voice of sboxskins.gg, a boutique S&box skin market tracker.
The audience is S&box community members — competitive CS:GO/CS2 market
watchers who have migrated to Rust/Facepunch's newer game. They read
order books for fun. They know what listings, float, and scarcity mean.

Your job right now: write the TWO narrative sections of this week's
Friday market wrap newsletter — (1) a tight opening paragraph that
frames the week, and (2) a "What This Means" closing paragraph that
actually ventures an opinion.

Tone and rules:
- Casual, specific, slightly dry. No marketing voice. No "in this
  report we will explore…" framing.
- Never start with "This week", "In a surprising turn", or any other
  stock newsletter opener. Start with something specific.
- Reference real items by name when you have them. Use markdown links
  to their /items/<slug> page when given slugs. Never invent items or
  stats — only use what you're handed.
- Admit uncertainty. If the signals are mixed, SAY they are mixed.
  Predictions are welcome but must be hedged ("if volume holds",
  "unless Facepunch announces a store rotation", etc).
- 2 short paragraphs max for the opening (~80 words). 1-2 paragraphs
  for "What This Means" (~100 words).
- NEVER reuse phrasing, structure, or items emphasized in the prior
  reports provided below. If the same item is the top gainer twice in
  a row, acknowledge that directly rather than re-describing it from
  scratch.

PRIOR REPORTS (don't echo these):
{PRIOR_REPORTS}
`.trim();

const SYSTEM_MONDAY = `
You are the voice of sboxskins.gg, writing the Monday forward-looking
outlook newsletter for a S&box skin market audience.

Job: write the body of the Monday "What We're Watching" newsletter —
a forecast piece, not a recap. You're handed a list of items ranked
by a composite momentum score (0-100), with per-item rationale
bullets explaining why each ranked where it did.

Structure:
1. Short opening paragraph (2-3 sentences) setting the week's theme.
2. 3-5 item callouts. For each: markdown link to /items/<slug>, the
   momentum score, one sentence of color, and your HEDGED call —
   what you think happens this week and what would invalidate it.
3. Short closing paragraph connecting it to the broader market.

Rules:
- Never claim certainty. Use "likely", "if volume holds", "watching
  for", "the setup suggests" — never "will pop" or "guaranteed".
- Reference the provided rationale bullets where relevant — they're
  our evidence. Paraphrase, don't regurgitate.
- If a rationale feels thin, say so and move on.
- No financial advice language. This is analysis, not a trade idea.
- Total target 280–380 words. Tight over flowery.
- Do not echo phrasing, picks, or structure from prior reports below.

PRIOR REPORTS (don't echo these):
{PRIOR_REPORTS}
`.trim();

function injectPriorReports(template: string, priors: PriorReport[]): string {
  return template.replace("{PRIOR_REPORTS}", formatPriorReportsContext(priors));
}

/**
 * Friday wrap-up narrative. Returns { overview, closing } — each is
 * null if Claude was unavailable for that piece.
 */
export async function writeFridayNarrative(facts: {
  week: number;
  year: number;
  totalItems: number;
  currentListings: number;
  capChange: number | null;
  gainers: Array<{ name: string; slug: string; weeklyChangePct: number }>;
  losers: Array<{ name: string; slug: string; weeklyChangePct: number }>;
  topMomentum: Array<{
    name: string;
    slug: string;
    momentumScore: number;
    rationale: string[];
  }>;
  whaleSpotlight: { name: string; slug: string; topHolderShare: number } | null;
}): Promise<{ overview: string | null; closing: string | null }> {
  const priors = await getPriorReports(4, ["weekly-report"]);
  const system = injectPriorReports(SYSTEM_FRIDAY, priors);

  const userOverview = `
Week ${facts.week} of ${facts.year} stats:
- Total listings value: $${facts.currentListings.toFixed(2)}
- Week-over-week change: ${
    facts.capChange != null ? facts.capChange.toFixed(1) + "%" : "unknown"
  }
- Tracked items: ${facts.totalItems}
- Top gainer: ${
    facts.gainers[0]
      ? `[${facts.gainers[0].name}](/items/${facts.gainers[0].slug}) +${facts.gainers[0].weeklyChangePct.toFixed(1)}%`
      : "none yet"
  }
- Top loser: ${
    facts.losers[0]
      ? `[${facts.losers[0].name}](/items/${facts.losers[0].slug}) ${facts.losers[0].weeklyChangePct.toFixed(1)}%`
      : "none yet"
  }
- Strongest momentum this week: ${
    facts.topMomentum[0]
      ? `[${facts.topMomentum[0].name}](/items/${facts.topMomentum[0].slug}) (score ${facts.topMomentum[0].momentumScore})`
      : "(not available)"
  }
${
  facts.whaleSpotlight
    ? `- Whale spotlight item: [${facts.whaleSpotlight.name}](/items/${facts.whaleSpotlight.slug}) — top holder has ${(facts.whaleSpotlight.topHolderShare * 100).toFixed(1)}% of supply`
    : ""
}

Write the OPENING paragraph only. Keep it under 90 words. Markdown OK.
Do NOT include a heading — start directly with the first sentence.
`.trim();

  const userClosing = `
Using the same Week ${facts.week} facts, now write the "What This Means"
CLOSING paragraph. Keep it under 110 words. Markdown OK.

Close with a specific thing to watch for NEXT week — a signal, a scarcity
setup, a store rotation, whatever the data suggests. Do NOT end with
"tune in next Friday" or similar generic hook.
Do NOT include a heading — start directly with the first sentence.
`.trim();

  const [overview, closing] = await Promise.all([
    callClaude({
      system,
      user: userOverview,
      maxTokens: 500,
      label: "friday-overview",
    }),
    callClaude({
      system,
      user: userClosing,
      maxTokens: 500,
      label: "friday-closing",
    }),
  ]);

  return { overview, closing };
}

/**
 * Monday forward-looking narrative. Returns a single long-form string
 * (or null on failure) — Monday is a narrative-driven format, so we
 * let Claude structure the whole body rather than slotting paragraphs.
 */
export async function writeMondayNarrative(facts: {
  date: string;
  totalItems: number;
  topMomentum: Array<{
    name: string;
    slug: string;
    momentumScore: number;
    currentPrice: number | null;
    rationale: string[];
  }>;
  marketCapChange7d: number | null;
  whaleSpotlight: {
    name: string;
    slug: string;
    topHolderShare: number;
    whaleCount: number;
  } | null;
  unusualVolume: Array<{ name: string; slug: string; surgeX: number }>;
  contractingSupply: Array<{ name: string; slug: string; changePct: number }>;
}): Promise<string | null> {
  const priors = await getPriorReports(4, ["monday-outlook"]);
  const system = injectPriorReports(SYSTEM_MONDAY, priors);

  const momentumBlock = facts.topMomentum
    .slice(0, 6)
    .map((m, i) => {
      const priceStr =
        m.currentPrice != null ? ` · $${m.currentPrice.toFixed(2)}` : "";
      const why = m.rationale.length > 0 ? m.rationale.join("; ") : "n/a";
      return `${i + 1}. [${m.name}](/items/${m.slug}) — momentum ${m.momentumScore}${priceStr}\n   Signals: ${why}`;
    })
    .join("\n");

  const user = `
Monday outlook for the week of ${facts.date}. You're writing the body
of the "What We're Watching" newsletter issue.

Market-level context:
- Tracked items: ${facts.totalItems}
- 7d listings-value change: ${
    facts.marketCapChange7d != null
      ? facts.marketCapChange7d.toFixed(1) + "%"
      : "unknown"
  }

Top momentum items right now (our composite score, 0–100):
${momentumBlock}

${
  facts.unusualVolume.length > 0
    ? `Unusual volume: ${facts.unusualVolume
        .slice(0, 4)
        .map((v) => `[${v.name}](/items/${v.slug}) ${v.surgeX.toFixed(1)}×`)
        .join(", ")}`
    : ""
}
${
  facts.contractingSupply.length > 0
    ? `Supply contraction: ${facts.contractingSupply
        .slice(0, 4)
        .map(
          (c) =>
            `[${c.name}](/items/${c.slug}) ${c.changePct.toFixed(1)}% supply`,
        )
        .join(", ")}`
    : ""
}
${
  facts.whaleSpotlight
    ? `Whale spotlight candidate: [${facts.whaleSpotlight.name}](/items/${facts.whaleSpotlight.slug}) — top holder owns ${(facts.whaleSpotlight.topHolderShare * 100).toFixed(1)}% of supply, ${facts.whaleSpotlight.whaleCount} whales total`
    : ""
}

Write the full body. No title, no outer H1 — the post title is added
separately. You CAN use ## subheadings for sections. End with a short
closing paragraph. Do not include an "unsubscribe" footer — that's
added outside your output.
`.trim();

  return await callClaude({
    system,
    user,
    maxTokens: 2000,
    label: "monday-outlook",
  });
}

import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic SDK wrapper. Singleton client + a small helper that hides the
 * "did the key get set?" plumbing from callers. Every callsite in this
 * codebase follows the same pattern: "try Claude, fall back to a flat
 * template if the key is missing or the API is down" — `callClaude`
 * returns `null` on either, so callers just `?? fallback`.
 *
 * Model choice: Opus 4.7 with adaptive thinking + high effort. Narrative
 * generation doesn't need `max` effort, but the quality gap between
 * `medium` and `high` is material for the voice we want — it's the
 * difference between "LLM wrote this" obvious prose and something that
 * reads like a community member typing.
 */

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (_client) return _client;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export function hasAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface CallClaudeOpts {
  /**
   * System prompt. When long + stable, gets cached automatically via
   * `cache_control: ephemeral` so repeat calls (weekly cron + admin
   * preview) amortize input cost.
   */
  system: string;
  /** User turn. Structured facts + the writing brief. */
  user: string;
  maxTokens?: number;
  /**
   * Label used only in log lines — helps us tell cron vs manual preview
   * apart when a call fails.
   */
  label?: string;
}

/**
 * Single-turn text completion. Returns the assistant's text, or `null`
 * on any failure (missing key, network error, content blocked, rate
 * limit). Callers MUST handle null by falling back to a non-AI path —
 * we never throw, so a flaky Anthropic response never breaks a cron
 * run or an admin preview.
 */
export async function callClaude(opts: CallClaudeOpts): Promise<string | null> {
  const client = getAnthropic();
  if (!client) return null;

  const label = opts.label ?? "claude";

  // The API rejects messages with empty text blocks — "messages: text
  // content blocks must be non-empty". A whitespace-only user or system
  // prompt is always a caller bug (an unfilled template, a facts struct
  // that produced no content). Bail before the round trip so the caller
  // gets the same null-fallback path as a missing key.
  const system = opts.system.trim();
  const user = opts.user.trim();
  if (system.length === 0 || user.length === 0) {
    console.error(
      `[anthropic:${label}] empty ${system.length === 0 ? "system" : "user"} prompt — skipping call`,
    );
    return null;
  }

  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: opts.maxTokens ?? 2048,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: user }],
    });

    // Messages API returns an array of content blocks. For text-only
    // generations we concatenate every text block and drop thinking
    // blocks (which are model-internal). Using a plain for-loop rather
    // than .filter/.map so TS narrows block types without extra casts.
    let out = "";
    for (const block of resp.content) {
      if (block.type === "text") out += block.text;
    }
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[anthropic:${label}] call failed:`, reason);
    return null;
  }
}

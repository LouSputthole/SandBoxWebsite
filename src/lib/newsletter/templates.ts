import { SITE_ORIGIN } from "./client";

/**
 * HTML + plaintext email templates. Both flavors are always emitted —
 * gmail/outlook render HTML but spam filters punish HTML-only mail, and
 * terminal mail clients still exist.
 *
 * Design rules learned from sending transactional email:
 * - No external CSS, no webfonts, no JS. Style inline on every element.
 * - No background images — Gmail strips them.
 * - Max width ~600px so mobile clients don't horizontal-scroll.
 * - Always include an unsubscribe link in the footer. CAN-SPAM + Gmail
 *   bulk-sender rules require it for the newsletter kind; we include it
 *   on verification too for consistency (even though verification
 *   doesn't need it legally).
 * - Preheader text — hidden first line that previews in inbox listings.
 */

const BRAND = {
  accent: "#a78bfa",
  accentDark: "#7c3aed",
  bg: "#0a0812",
  fg: "#ededf0",
  muted: "#8a8a98",
  border: "#26262e",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal markdown → HTML converter for the newsletter body. We only
 * support what our blog posts emit: `## headings`, `**bold**`, `_em_`,
 * `[link](url)`, numbered/bulleted lists, `---` hr, paragraphs. Built
 * with explicit substitution rather than a library because the content
 * we feed it is our own generator's output — we know every shape we
 * need to handle and nothing else.
 *
 * Relative `/links` get prefixed with `SITE_ORIGIN` so they work in an
 * email client (mail clients don't have a base URL).
 */
export function markdownToEmailHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      out.push(
        `<p style="margin:0 0 16px;color:${BRAND.fg};font-size:15px;line-height:1.6;">${inline(para.join(" "))}</p>`,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      out.push(
        `<ol style="margin:0 0 16px;padding-left:22px;color:${BRAND.fg};font-size:15px;line-height:1.7;">${list.map((li) => `<li style="margin-bottom:4px;">${inline(li)}</li>`).join("")}</ol>`,
      );
      list = [];
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
      out.push(
        `<hr style="border:0;border-top:1px solid ${BRAND.border};margin:28px 0;" />`,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      flushList();
      out.push(
        `<h2 style="margin:28px 0 12px;color:#ffffff;font-size:18px;font-weight:700;">${inline(line.slice(3))}</h2>`,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      flushList();
      out.push(
        `<h1 style="margin:32px 0 14px;color:#ffffff;font-size:22px;font-weight:800;">${inline(line.slice(2))}</h1>`,
      );
      continue;
    }
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      flushPara();
      list.push(olMatch[2]);
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      list.push(line.slice(2));
      continue;
    }
    if (line.startsWith("_") && line.endsWith("_")) {
      flushPara();
      flushList();
      out.push(
        `<p style="margin:0 0 16px;color:${BRAND.muted};font-size:12px;font-style:italic;line-height:1.5;">${inline(line.slice(1, -1))}</p>`,
      );
      continue;
    }
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join("\n");
}

function inline(text: string): string {
  // Order matters: escape first, then replace markdown inline syntax
  // with known-safe HTML. We never hand user-generated strings to this
  // path — output is all from our own generator — but escape anyway
  // as defense in depth.
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#ffffff;">$1</strong>');
  s = s.replace(/\b_(.+?)_\b/g, "<em>$1</em>");
  s = s.replace(/\[(.+?)\]\((\/[^)]+)\)/g, (_, label, href) => {
    return `<a href="${SITE_ORIGIN}${escapeHtml(href)}" style="color:${BRAND.accent};text-decoration:underline;">${label}</a>`;
  });
  s = s.replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, (_, label, href) => {
    return `<a href="${escapeHtml(href)}" style="color:${BRAND.accent};text-decoration:underline;">${label}</a>`;
  });
  return s;
}

/**
 * Wrap a block of inner HTML in the email shell: branded header +
 * footer with unsubscribe link + legal minimum (who this is from, why
 * you're getting it).
 */
function shell(opts: {
  preheader: string;
  inner: string;
  unsubscribeUrl: string;
  footerNote?: string;
}): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>sboxskins.gg</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${BRAND.fg};">
    <!-- Preheader: hidden in body, shown by inbox previews. -->
    <div style="display:none;overflow:hidden;line-height:1;max-height:0;opacity:0;">${escapeHtml(opts.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${SITE_ORIGIN}" style="color:${BRAND.accent};font-size:22px;font-weight:800;letter-spacing:-0.02em;text-decoration:none;">
                  sboxskins.gg
                </a>
              </td>
            </tr>
            <tr>
              <td style="background:#12101a;border:1px solid ${BRAND.border};border-radius:12px;padding:28px;">
                ${opts.inner}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 4px;color:${BRAND.muted};font-size:12px;line-height:1.6;">
                ${opts.footerNote ? `<p style="margin:0 0 10px;">${opts.footerNote}</p>` : ""}
                <p style="margin:0 0 8px;">
                  Sent by sboxskins.gg — the independent S&amp;box skin market tracker.
                  <a href="${SITE_ORIGIN}" style="color:${BRAND.muted};text-decoration:underline;">sboxskins.gg</a>
                </p>
                <p style="margin:0;">
                  Don't want these? <a href="${opts.unsubscribeUrl}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe in one click.</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ---------- Public template builders ----------

export interface VerifyEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildVerifyEmail(opts: {
  verifyUrl: string;
  unsubscribeUrl: string;
}): VerifyEmailContent {
  const inner = `
    <h1 style="margin:0 0 14px;color:#ffffff;font-size:22px;font-weight:800;">Confirm your address</h1>
    <p style="margin:0 0 18px;color:${BRAND.fg};font-size:15px;line-height:1.6;">
      Tap the button below to confirm you want the sboxskins.gg newsletter.
      One click, no password.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${opts.verifyUrl}" style="display:inline-block;background:${BRAND.accentDark};color:#ffffff;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;">
        Confirm subscription
      </a>
    </p>
    <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.6;">
      If the button doesn't work, paste this into your browser:<br />
      <span style="word-break:break-all;">${escapeHtml(opts.verifyUrl)}</span>
    </p>
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:12px;line-height:1.6;">
      Didn't sign up? Ignore this email and nothing happens — we won't send more
      until someone confirms.
    </p>
  `;
  const html = shell({
    preheader: "Confirm your sboxskins.gg newsletter subscription — one click.",
    inner,
    unsubscribeUrl: opts.unsubscribeUrl,
    footerNote:
      "You're getting this because someone entered this email at sboxskins.gg.",
  });

  const text = `Confirm your sboxskins.gg newsletter subscription

Tap this link to confirm:
${opts.verifyUrl}

Didn't sign up? Ignore this email.

If you ever want out: ${opts.unsubscribeUrl}`;

  return {
    subject: "Confirm your sboxskins.gg newsletter",
    html,
    text,
  };
}

export interface IssueEmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Wrap a published BlogPost as a newsletter issue. We reuse the post's
 * own markdown body rather than building a separate email template —
 * keeps the web and email views in perfect sync without double
 * authoring. The only email-specific wrapper is the branded shell +
 * unsubscribe footer.
 */
export function buildIssueEmail(opts: {
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  postUrl: string;
  kindLabel: string;
  unsubscribeUrl: string;
}): IssueEmailContent {
  const bodyHtml = markdownToEmailHtml(opts.bodyMarkdown);
  const inner = `
    <p style="margin:0 0 6px;color:${BRAND.accent};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
      ${escapeHtml(opts.kindLabel)}
    </p>
    <h1 style="margin:0 0 10px;color:#ffffff;font-size:26px;font-weight:800;line-height:1.2;letter-spacing:-0.01em;">
      ${escapeHtml(opts.title)}
    </h1>
    <p style="margin:0 0 22px;color:${BRAND.muted};font-size:14px;line-height:1.5;">
      ${escapeHtml(opts.excerpt)}
    </p>
    ${bodyHtml}
    <p style="margin:24px 0 0;">
      <a href="${opts.postUrl}" style="display:inline-block;color:${BRAND.accent};font-weight:600;font-size:14px;text-decoration:none;">
        Read on sboxskins.gg →
      </a>
    </p>
  `;
  const html = shell({
    preheader: opts.excerpt,
    inner,
    unsubscribeUrl: opts.unsubscribeUrl,
    footerNote: `${opts.kindLabel} · you subscribed on sboxskins.gg.`,
  });

  // Plaintext: strip markdown to a readable form. Not pretty but every
  // link and line break survives, which is what text-only clients need.
  const text = `${opts.kindLabel.toUpperCase()}\n\n${opts.title}\n\n${opts.excerpt}\n\n${opts.bodyMarkdown
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const abs = href.startsWith("/") ? `${SITE_ORIGIN}${href}` : href;
      return `${label} (${abs})`;
    })
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\b_(.+?)_\b/g, "$1")
    .replace(/^## /gm, "")
    .replace(/^# /gm, "")
    .replace(/^---$/gm, "———")}\n\nRead online: ${opts.postUrl}\n\nUnsubscribe: ${opts.unsubscribeUrl}`;

  return {
    subject: opts.title,
    html,
    text,
  };
}

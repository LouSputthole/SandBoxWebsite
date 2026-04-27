/**
 * Pure UA-string parser, isolated in its own module so client components
 * (`/account/sessions` panel) can import it without pulling in
 * `next/headers` — which would make the bundle server-only and break the
 * build with: "You're importing a module that depends on next/headers."
 *
 * Not accurate enough to block on, but good enough for the sessions UI
 * to render "Chrome on macOS" instead of a 200-char gibberish string.
 */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : /curl|wget|python|node/i.test(ua)
            ? "CLI"
            : "Browser";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

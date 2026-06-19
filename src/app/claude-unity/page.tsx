import type { Metadata } from "next";
import Image from "next/image";

// Product landing page for "Claude Bridge for Unity".
// Indexed + in the sitemap, but intentionally NOT linked from the site navbar.
// When the Asset Store listing goes live, drop the real URL in ASSET_STORE_URL.
const ASSET_STORE_URL = ""; // e.g. "https://assetstore.unity.com/packages/..."
const PROXY_RELEASES = "https://github.com/LouSputthole/claude-bridge-unity-proxy/releases/latest";

export const metadata: Metadata = {
  title: "Claude Bridge for Unity — Drive Your Editor with AI",
  description:
    "An MCP bridge that turns your running Unity Editor into ~300 AI-callable tools. Works with any MCP client (Claude, ChatGPT/Codex, Cursor, Windsurf). Local-only, survives domain reloads, extensible.",
  alternates: { canonical: "/claude-unity" },
  // Indexed + shareable; intentionally not linked from the site nav.
  openGraph: {
    title: "Claude Bridge for Unity — Drive Your Editor with AI",
    description:
      "Turn your running Unity Editor into ~300 AI-callable tools. Any MCP client. Local-only.",
    url: "https://sboxskins.gg/claude-unity",
    type: "website",
    images: [{ url: "/claude-unity/cover.png", width: 1950, height: 1300, alt: "Claude Bridge for Unity" }],
  },
  twitter: { card: "summary_large_image", images: ["/claude-unity/cover.png"] },
};

const FEATURES: [string, string][] = [
  ["Built for game dev", "Scaffolds, NPC & worldgen tools, scene composition, and a screenshot-driven verify loop — not just generic get/set."],
  ["Survives domain reloads", "With the stdio proxy, a normal recompile never drops the AI's session."],
  ["Client-agnostic", "Claude Code & Desktop, ChatGPT/Codex, Cursor, Windsurf, Cline, Zed — anything that speaks MCP. The model behind it doesn't matter."],
  ["Two transports", "HTTP (zero extra downloads) or a self-contained stdio proxy."],
  ["Honest results", "Every mutating tool verifies its change took effect before reporting success. No silent failures."],
  ["Reflection-grounded", "The bridge reads Unity's real API surface, so tools reflect your installed version, not stale assumptions."],
  ["Extensible", "Tag your own public static methods [McpTool] and they appear as callable tools automatically."],
  ["Local & private", "Binds 127.0.0.1. Your project never leaves your machine."],
];

const FAMILIES: [string, string][] = [
  ["Scene & objects", "GameObjects, transforms, components, hierarchy, prefabs, scene composition"],
  ["Look & feel", "Materials, lighting, light baking, atmosphere, cameras, post/SRP volumes"],
  ["Motion & FX", "Animation, particles, audio, Cinemachine"],
  ["World", "Terrain, worldgen, NavMesh, physics"],
  ["Systems", "Input System, networking, UI & UI layout"],
  ["Code", "Create/edit C# scripts, reflection, runtime inspection, diagnostics, compile errors"],
  ["See & test", "Screenshots, visual verification, playmode control, in-play simulation"],
  ["Make a game fast", "Gameplay scaffolds (health/pickups/interactables/loot/objectives/economy/day-night), NPC tools"],
];

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-400/10 px-4 py-1.5 text-sm font-semibold text-indigo-100">
      <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px] shadow-cyan-400" />
      {children}
    </span>
  );
}

export default function ClaudeUnityPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
      {/* Hero */}
      <section className="text-center">
        <div className="mx-auto mb-7 h-16 w-16">
          <Image src="/claude-unity/icon.png" alt="Claude Bridge for Unity" width={160} height={160} className="h-16 w-16 rounded-2xl" priority />
        </div>
        <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
          Drive your Editor{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">with AI.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-neutral-300 sm:text-xl">
          <strong className="text-white">Claude Bridge for Unity</strong> turns your running Unity Editor into
          ~300 AI-callable tools over the Model Context Protocol — create, build, <em>see</em>, and verify, all
          inside the Editor you already have open.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Chip>300 tools</Chip>
          <Chip>100% local</Chip>
          <Chip>any MCP client</Chip>
        </div>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          {ASSET_STORE_URL ? (
            <a href={ASSET_STORE_URL} className="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 font-semibold text-white shadow-lg transition hover:opacity-90">
              Get it on the Unity Asset Store
            </a>
          ) : (
            <span className="rounded-lg border border-indigo-400/40 bg-indigo-400/10 px-6 py-3 font-semibold text-indigo-200">
              Unity Asset Store — coming soon
            </span>
          )}
          <a href={PROXY_RELEASES} className="rounded-lg border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10">
            Download the free proxy
          </a>
        </div>
      </section>

      {/* Cover */}
      <section className="mt-14">
        <Image
          src="/claude-unity/cover.png"
          alt="Claude Bridge for Unity — drive your Editor with AI"
          width={1950}
          height={1300}
          className="h-auto w-full rounded-2xl border border-white/10 shadow-2xl"
          priority
        />
      </section>

      {/* Why it's different */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold sm:text-3xl">Why it&apos;s different</h2>
        <p className="mt-2 max-w-3xl text-neutral-400">
          Built for game development specifically — not a thin remote-procedure layer.
        </p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What it can do */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold sm:text-3xl">300 tools across 38 families</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {FAMILIES.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="font-semibold text-cyan-300">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Get started */}
      <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-7 sm:p-9">
        <h2 className="text-2xl font-bold sm:text-3xl">Get started</h2>
        <p className="mt-2 text-neutral-300">Import the Editor package, then connect your AI client one of two ways:</p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-white">HTTP <span className="text-neutral-500">— no extra download</span></h3>
            <p className="mt-1.5 text-sm text-neutral-400">
              In Unity: <span className="text-neutral-200">Window ▸ Claude Bridge ▸ Options</span> → enable the HTTP endpoint,
              then point your client at the shown URL.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-neutral-300">{`{ "mcpServers": { "claude-bridge-unity":
  { "type": "http", "url": "http://127.0.0.1:17321/mcp" } } }`}</pre>
          </div>
          <div>
            <h3 className="font-semibold text-white">stdio <span className="text-neutral-500">— survives recompiles</span></h3>
            <p className="mt-1.5 text-sm text-neutral-400">
              Download the free, self-contained proxy for your OS, then register it with your client.
            </p>
            <a href={PROXY_RELEASES} className="mt-3 inline-block rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              Proxy downloads (Win · macOS · Linux) →
            </a>
          </div>
        </div>
        <p className="mt-6 text-sm text-neutral-500">
          Requires Unity 2022.3 LTS+ (developed on Unity 6.4). An MCP-capable AI client is sold separately / free — not included.
        </p>
      </section>

      <footer className="mt-14 border-t border-white/10 pt-7 text-sm text-neutral-500">
        Not affiliated with Unity Technologies, Anthropic, or OpenAI. &ldquo;Claude&rdquo;, &ldquo;ChatGPT&rdquo;, and other
        names are trademarks of their respective owners; the bridge is compatible with any MCP client.
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  Zap,
  Users,
  Lightbulb,
  Network,
  Bug,
  Mountain,
  Bot,
  Wrench,
  BookOpen,
  ShieldCheck,
  Gamepad2,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: undefined, // uses the layout's default title
  description:
    "Claude Bridge for s&box — build s&box games by talking to Claude (or any AI). 200+ tools that write scripts, build scenes, wire components, and whole game systems, plus a cookbook brain mined from real shipped games.",
  alternates: { canonical: "/claudebridge" },
};

const CAPABILITIES: { icon: React.ElementType; title: string; body: string }[] = [
  { icon: Boxes, title: "Scene & GameObjects", body: "Create, clone, transform, parent, and find objects; full hierarchy + editor selection; scripts, scenes, and prefabs." },
  { icon: Wrench, title: "Components & scaffolds", body: "Add/remove any component; one-call scaffolds for health, inventory, save systems, economies, shops, leaderboards, and more." },
  { icon: Zap, title: "Physics & spatial", body: "Rigidbodies, colliders, joints, raycasts, and volume-overlap queries." },
  { icon: Lightbulb, title: "Lighting & atmosphere", body: "Lights, fog, post-FX, skyboxes, reflection probes, and one-call mood presets (Horror Night, Foggy Dawn…)." },
  { icon: Users, title: "Characters & animation", body: "Spawn, dress, and pose Citizens; equip props; drive the AnimationGraph and play named animations." },
  { icon: Mountain, title: "Terrain & world-gen", body: "Heightmap sculpt brushes, hills, trails, cave paths, forest scatter & density painting." },
  { icon: Network, title: "Networking & inspection", body: "Network spawn, sync, RPCs — then lint for multiplayer footguns and inspect exactly what replicates." },
  { icon: Bot, title: "NPC AI", body: "Generate behavior state machines (patrol → chase → search) with sight cones, hearing, patrol routes, and spawners." },
  { icon: Bug, title: "Debug & playtest", body: "Draw debug shapes in editor and play; pause / slow-mo / fast-forward the running game; read live performance counters." },
  { icon: BookOpen, title: "Live API & docs", body: "Reflects the real loaded SDK and searches the official s&box docs — so the generated C# actually compiles." },
];

export default function ClaudeBridgeOverview() {
  return (
    <div>
      {/* Hero */}
      <div className="mb-12">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-300">
          <Gamepad2 className="h-3.5 w-3.5" />
          v1.15.0 · 200+ tools · 190 handlers · AGPL-3.0
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Claude Bridge for s&amp;box
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-300">
          Build s&amp;box games by talking to Claude — or any AI. It works <em>inside</em> your
          s&amp;box editor: writing scripts, creating GameObjects, wiring components, and building
          whole systems. You describe what you want; Claude builds it, screenshots it, and fixes it.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/claudebridge/plugin"
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-purple-700"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://github.com/LouSputthole/Sbox-Claude"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-5 py-2.5 font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
          >
            View on GitHub
          </a>
        </div>
      </div>

      {/* The brain */}
      <section className="mb-12 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-white">🧠 It ships with a brain</h2>
        <p className="mt-3 text-neutral-300">
          The tools aren&apos;t the real story. The companion plugin bundles{" "}
          <strong className="text-white">sbox-cookbook</strong> — a code-grounded knowledge base of
          how to actually build games in s&amp;box, mined from <strong className="text-white">real,
          shipped, open-source s&amp;box games</strong> plus the modern engine source. So the AI
          reaches for proven, shipped patterns — real inventories, economies, save systems, shops,
          gacha, progression, multiplayer netcode, whole genre playbooks — instead of guessing.
        </p>
        <p className="mt-3 text-sm text-neutral-400">
          Ask for a system <em>by name</em> (&ldquo;build me a host-authoritative shop&rdquo;) and it
          routes to the grounded recipe for that problem.
        </p>
      </section>

      {/* What it can do */}
      <section className="mb-12">
        <h2 className="mb-1 text-2xl font-bold text-white">What it can do</h2>
        <p className="mb-6 text-neutral-400">
          200+ tools across the whole editor — here are the big areas.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 transition-colors hover:border-neutral-700"
            >
              <div className="mb-3 inline-flex rounded-lg bg-purple-500/10 p-2 text-purple-400">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold text-white">How it works</h2>
        <div className="space-y-4">
          {[
            {
              you: "Make a player controller with WASD, mouse look, double-jump, and a flashlight.",
              claude:
                "writes the script, adds the component, wires the input, sets up the spotlight — then aims a camera, screenshots it, and checks its own work.",
            },
            {
              you: "Build me an inventory system with a hotbar.",
              claude:
                "opens the cookbook's inventory recipe, builds it the way real games do (host-authoritative, networked, drag-and-drop), then runs networking_lint to confirm it replicates.",
            },
          ].map((ex, i) => (
            <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
              <p className="text-sm">
                <span className="font-semibold text-purple-400">You:</span>{" "}
                <span className="text-neutral-200">&ldquo;{ex.you}&rdquo;</span>
              </p>
              <p className="mt-2 text-sm">
                <span className="font-semibold text-neutral-300">Claude:</span>{" "}
                <span className="text-neutral-400">{ex.claude}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Self-verifying note */}
      <section className="mb-12 flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
        <p className="text-sm text-neutral-300">
          <strong className="text-white">Self-verifying.</strong> For anything visual, Claude aims a
          camera, screenshots its work, and reads the result back before showing you. For multiplayer
          it lints networking and inspects what replicates. It reads its own logs and compile errors —
          even when the editor stalls — so it closes the build-and-check loop instead of hoping.
        </p>
      </section>

      {/* Next links */}
      <section className="border-t border-neutral-800 pt-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Keep reading</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { href: "/claudebridge/plugin", title: "Plugin & setup →", body: "Install it and learn how to drive it." },
            { href: "/claudebridge/changelog", title: "Changelog →", body: "Every release, newest first." },
            { href: "/claudebridge/troubleshooting", title: "Troubleshooting →", body: "Fixes for the common failure modes." },
            { href: "/claudebridge/faq", title: "FAQ →", body: "Quick answers to common questions." },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-purple-500/40 hover:bg-neutral-900"
            >
              <div className="font-medium text-white">{l.title}</div>
              <div className="mt-1 text-sm text-neutral-400">{l.body}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

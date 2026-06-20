import type { Metadata } from "next";
import Link from "next/link";
import { Package, Boxes, Bot, Brain, Camera, Lightbulb } from "lucide-react";

export const metadata: Metadata = {
  title: "Plugin & setup",
  description:
    "Install the Claude Bridge for s&box and learn how to drive it — the one-command Claude Code plugin (cookbook brain, specialist agent, screenshot workflow) or any MCP client via npm, plus example prompts and tips.",
  alternates: { canonical: "/claudebridge/plugin" },
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm leading-relaxed text-neutral-200">
      <code>{children}</code>
    </pre>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.85em] text-purple-300">
      {children}
    </code>
  );
}

export default function PluginPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Plugin &amp; setup</h1>
      <p className="mt-3 max-w-2xl text-neutral-400">
        The bridge is two pieces: the <strong className="text-neutral-200">addon</strong> that runs
        inside s&amp;box, and the <strong className="text-neutral-200">MCP server</strong> that links
        Claude to it over local file IPC. Install the addon once, then connect the Claude side.
      </p>

      {/* Install */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold text-white">Install</h2>

        <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="mb-2 flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-400" />
            <h3 className="font-semibold text-white">1. Install the addon — everyone</h3>
          </div>
          <p className="text-sm text-neutral-400">
            Install it from the s&amp;box{" "}
            <a
              href="https://sbox.game"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300"
            >
              Asset Library
            </a>
            . s&amp;box drops it into your project&apos;s <Mono>Libraries/claudebridge/</Mono>{" "}
            automatically.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent p-6">
          <h3 className="font-semibold text-white">
            2A. Connect with the Claude Code plugin <span className="text-purple-300">(recommended)</span>
          </h3>
          <p className="mt-1 text-sm text-neutral-400">
            One command. It registers + auto-updates the MCP server <em>and</em> bundles the cookbook
            brain, the specialist agent, the screenshot workflow skill, and onboarding — the full
            experience.
          </p>
          <Code>{`/plugin marketplace add LouSputthole/Sbox-Claude
/plugin install sbox-claude`}</Code>
          <p className="text-sm text-neutral-500">Then restart Claude Code (or run <Mono>/reload-plugins</Mono>).</p>
        </div>

        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h3 className="font-semibold text-white">2B. Or connect manually — any MCP client</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Works with any MCP client (not just Claude Code) — you just wire the brain in yourself.
            Needs Node.js 18+.
          </p>
          <Code>{`claude mcp add sbox -- npx sbox-mcp-server@latest`}</Code>
        </div>

        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h3 className="font-semibold text-white">3. Verify</h3>
          <p className="mt-1 text-sm text-neutral-400">
            In your project folder, ask Claude <em>&ldquo;Check the bridge status&rdquo;</em> — you
            want <Mono>connected: true</Mono> with a live handler count. Then try{" "}
            <em>&ldquo;Create a cube at 0, 0, 100 with a box model.&rdquo;</em>
          </p>
          <p className="mt-3 text-sm text-neutral-500">
            The <strong className="text-neutral-300">Claude Bridge dock</strong> (View → Claude Bridge)
            gives a status readout, but you do <strong>not</strong> need to keep it open — since v1.3
            the bridge runs on a static frame handler that processes requests with the dock closed.
          </p>
        </div>
      </section>

      {/* Using the plugin */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-white">Using the plugin</h2>
        <p className="mt-2 text-neutral-400">
          Once it&apos;s connected, you just talk to Claude in your project folder — no commands to
          memorize.
        </p>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <h3 className="font-semibold text-white">1. Describe what you want</h3>
            <p className="mt-1 text-sm text-neutral-400">Plain English; Claude writes the C#, wires it up, and checks its own work.</p>
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-300">
              <li>&ldquo;Add a double-jump and a sprint with a stamina bar.&rdquo;</li>
              <li>&ldquo;Make the campfire flicker and cast warm light at night.&rdquo;</li>
              <li>&ldquo;Spawn 5 patrolling guards that chase the player on sight.&rdquo;</li>
            </ul>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="mb-1 flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400" />
              <h3 className="font-semibold text-white">2. Ask for whole systems by name</h3>
            </div>
            <p className="text-sm text-neutral-400">This is where the cookbook brain kicks in and builds it the way shipped games do.</p>
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-300">
              <li>&ldquo;Build me a host-authoritative shop with a currency wallet.&rdquo;</li>
              <li>&ldquo;Give me a save system with autosave and versioned saves.&rdquo;</li>
              <li>&ldquo;Add an inventory with a hotbar and drag-and-drop.&rdquo;</li>
            </ul>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="mb-1 flex items-center gap-2">
              <Camera className="h-4 w-4 text-purple-400" />
              <h3 className="font-semibold text-white">3. Let it verify itself</h3>
            </div>
            <p className="text-sm text-neutral-400">
              For anything visual, Claude aims a camera, screenshots it, reads the result back, and
              fixes the angle/lighting before showing you. For multiplayer it runs{" "}
              <Mono>networking_lint</Mono> + <Mono>inspect_networked_object</Mono>. You don&apos;t
              have to ask — the <Mono>sbox-build-feature</Mono> skill enforces the build → screenshot →
              verify → fix loop.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="mb-1 flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-400" />
              <h3 className="font-semibold text-white">4. Hand off big tasks to the specialist agent</h3>
            </div>
            <p className="text-sm text-neutral-400">
              For a self-contained feature, point Claude at the bundled <Mono>sbox-game-dev</Mono>{" "}
              agent: <em>&ldquo;Use the sbox-game-dev agent to build a wave-survival mode with a round
              timer, escalating spawns, and a HUD.&rdquo;</em>
            </p>
          </div>
        </div>
      </section>

      {/* What's bundled */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-white">What the plugin bundles</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { icon: Brain, name: "sbox-cookbook", body: "The brain — code-grounded recipes mined from 51 shipped open-source s&box games. Genre playbooks, system how-tos, engine references." },
            { icon: Boxes, name: "sbox-api", body: "Correct s&box C# — Unity→s&box translation, the rules, and component/UI/networking/physics references. Stops Unity-pattern hallucination." },
            { icon: Camera, name: "sbox-build-feature", body: "The screenshot-driven build → verify → fix workflow, so Claude isn't building blind." },
            { icon: Lightbulb, name: "sbox-scaffold-game + onboarding", body: "Turn one ask into a playable starter scene; a wizard checks the bridge and your libraries on first connect." },
          ].map(({ icon: Icon, name, body }) => (
            <div key={name} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-purple-400" />
                <h3 className="font-mono text-sm font-semibold text-white">{name}</h3>
              </div>
              <p className="text-sm text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          You can also invoke any skill explicitly, e.g. <Mono>/sbox-claude:sbox-build-feature</Mono>.
        </p>
      </section>

      {/* Tips */}
      <section className="mt-12 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Tips for best results</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutral-400">
          <li>• <strong className="text-neutral-300">Use the plugin</strong> — the brain + agent + screenshot skill is most of the value, and it&apos;s one command.</li>
          <li>• <strong className="text-neutral-300">Save before a big batch</strong> (Ctrl+S), then turn Claude loose. Keep <Mono>.scene</Mono> files in Git.</li>
          <li>• <strong className="text-neutral-300">Ask for systems by name</strong> so the brain routes you to a proven recipe.</li>
          <li>• <strong className="text-neutral-300">Don&apos;t edit the scene during play mode</strong> — the bridge refuses it with a clear message.</li>
        </ul>
      </section>

      <div className="mt-12 border-t border-neutral-800 pt-8 text-sm text-neutral-500">
        Stuck? See{" "}
        <Link href="/claudebridge/troubleshooting" className="text-purple-400 hover:text-purple-300">
          Troubleshooting
        </Link>{" "}
        or the{" "}
        <Link href="/claudebridge/faq" className="text-purple-400 hover:text-purple-300">
          FAQ
        </Link>
        .
      </div>
    </div>
  );
}

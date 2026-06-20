import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about the Claude Bridge for s&box — what it is, whether you need to code, pricing, what you need to run it, the cookbook brain, privacy, and limitations.",
  alternates: { canonical: "/claudebridge/faq" },
};

const faqs = [
  {
    question: "What is the Claude Bridge for s&box?",
    answer:
      "It's a tool that lets an AI (Claude, or any MCP client) work inside your s&box editor — writing C# scripts, creating GameObjects, wiring components, building scenes, and assembling whole game systems. You describe what you want in plain English; the AI builds it, screenshots its own work, and fixes it.",
  },
  {
    question: "Do I need to know how to code?",
    answer:
      "No — that's the whole point. It was built for people who have game ideas but don't necessarily know how to code. You describe what you want and the AI writes the scripts, creates objects, and wires up systems that would otherwise be out of reach. Knowing some s&box concepts helps you steer, but it isn't required.",
  },
  {
    question: "Is it free?",
    answer:
      "Yes. The bridge is open source under AGPL-3.0 — free to use in your games (free or commercial) and free to modify. You'll need your own access to an AI client (e.g. Claude Code). The 's&box Claude Bridge' / 'sboxskins.gg' name and branding aren't licensed for reuse, but the code is open.",
  },
  {
    question: "What do I need to run it?",
    answer:
      "s&box (installed via Steam), Node.js 18+, and an MCP client — Claude Code is recommended because the one-command plugin bundles the cookbook brain, the specialist agent, and the screenshot workflow. The bridge works on Windows, Linux, and macOS.",
  },
  {
    question: "Do I have to use Claude Code?",
    answer:
      "No. The bridge's MCP server works with any MCP client via npm (claude mcp add sbox -- npx sbox-mcp-server@latest). Claude Code just gives you the full experience — the bundled brain, agent, and skills — in one command. With another client you wire those in yourself.",
  },
  {
    question: "What is the \"brain\" (sbox-cookbook)?",
    answer:
      "The hardest part of building an s&box game with an AI isn't typing C# — it's knowing the right pattern (how shipped games structure an inventory, keep money host-authoritative, version a save file). sbox-cookbook is a code-grounded knowledge base mined from real, shipped, open-source s&box games. Ask for a system by name and the AI reaches for a proven recipe instead of guessing.",
  },
  {
    question: "Is it safe? Where does my data go?",
    answer:
      "Everything stays on your machine. The MCP server and the s&box addon talk over local file IPC — no network, no open ports (s&box's sandboxed C# blocks sockets entirely). The AI client you use has its own privacy terms, but the bridge itself doesn't phone home.",
  },
  {
    question: "Can it build a whole game?",
    answer:
      "It's excellent at coding game systems through conversation — player controllers, NPC AI, networking, UI, inventories, economies, save systems, and whole genre loops the way shipped games do. It's serviceable at map building (it can screenshot and check its own work, but final visual polish still wants your eyes). Think of it as a tireless coding assistant inside the editor, not a one-click game generator.",
  },
  {
    question: "What can't it do well yet?",
    answer:
      "Particle authoring — s&box compiles particles in its own particle editor, not through the bridge. The AI can play a compiled .vpcf effect, but you build the effect in-editor first. Final visual/art polish on maps also still benefits from a human eye.",
  },
  {
    question: "Does the Claude Bridge dock need to stay open?",
    answer:
      "No. That was true in very early versions, but since v1.3 the bridge runs on a static frame handler that processes requests whether or not the dock is open. The dock (View → Claude Bridge) just gives you a status readout if you want it.",
  },
  {
    question: "How do I update it?",
    answer:
      "Reinstall the addon from the Asset Library when a new version drops. The MCP server updates itself — the plugin always pulls the latest, or npx sbox-mcp-server@latest grabs it on the next session. Keep the addon and the server on the same major.minor version.",
  },
  {
    question: "Where do I report bugs or request features?",
    answer:
      "Open an issue on GitHub (github.com/LouSputthole/Sbox-Claude) or email sboxskins@gmail.com. Including your get_bridge_status output and get_compile_errors makes bugs much faster to fix.",
  },
];

export default function ClaudeBridgeFaqPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <h1 className="text-3xl font-bold text-white">Claude Bridge FAQ</h1>
      <p className="mt-3 max-w-2xl text-neutral-400">
        Quick answers about the Claude Bridge for s&amp;box. New here? Start with the{" "}
        <Link href="/claudebridge" className="text-purple-400 hover:text-purple-300">
          overview
        </Link>{" "}
        or the{" "}
        <Link href="/claudebridge/plugin" className="text-purple-400 hover:text-purple-300">
          setup guide
        </Link>
        .
      </p>

      <div className="mt-10 space-y-4">
        {faqs.map((faq, i) => (
          <details
            key={i}
            className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50"
            {...(i === 0 ? { open: true } : {})}
          >
            <summary className="flex cursor-pointer items-center justify-between px-6 py-4 font-medium text-white transition-colors hover:bg-neutral-800/50">
              <span>{faq.question}</span>
              <span className="ml-4 text-xl text-neutral-500 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="px-6 pb-5 text-sm leading-relaxed text-neutral-400">{faq.answer}</div>
          </details>
        ))}
      </div>

      <div className="mt-12 text-center border-t border-neutral-800 pt-10">
        <p className="mb-4 text-neutral-400">Ready to build a game by talking to an AI?</p>
        <Link
          href="/claudebridge/plugin"
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-purple-700"
        >
          Get started
        </Link>
      </div>
    </>
  );
}

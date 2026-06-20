import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Troubleshooting",
  description:
    "Fixes for the most common Claude Bridge for s&box failure modes — IPC directory mismatch, compile failures, wrong screenshot angle, play-mode scene guards, version drift, and more.",
  alternates: { canonical: "/claudebridge/troubleshooting" },
};

const ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Connected, but every tool call times out",
    a: (
      <>
        <p className="mb-2">
          <strong className="text-neutral-300">Most common cause: an IPC directory mismatch.</strong>{" "}
          The MCP server (Node) resolves its temp dir from <code>TEMP</code>; the s&amp;box addon (C#)
          resolves from <code>TMP</code>. On some Windows setups those differ, so the server writes
          requests into a folder the addon never reads.
        </p>
        <p>
          Find the dir the addon uses (Editor → Claude Bridge → Status, or the <code>ipcDir</code> in{" "}
          <code>status.json</code>), then point the server at it with{" "}
          <code>SBOX_BRIDGE_IPC_DIR</code>. The addon does not honor an env override (sandbox safety),
          so always realign from the server side.
        </p>
      </>
    ),
  },
  {
    q: "The bridge shows disconnected (stale heartbeat)",
    a: (
      <p>
        s&amp;box isn&apos;t running, the project failed to load, or the addon failed to compile. Note:
        you do <strong className="text-neutral-300">not</strong> need the Claude Bridge dock open — since
        v1.3 the bridge runs on a static frame handler that processes requests with the dock closed. If
        the heartbeat is stale, check that s&amp;box is open and the addon compiled (see the next item).
      </p>
    ),
  },
  {
    q: "Tools stop working after an edit (C# compile failure)",
    a: (
      <p>
        Just read the error — <code>get_compile_errors</code> and <code>read_log</code> run
        server-side, so they work even when the editor is in a broken state. Fix the file the error
        names, <code>trigger_hotload</code>, and re-check. If game code fails to compile, the
        editor-side bridge fails too (<code>Broken Reference: package.local.X</code>) — the{" "}
        <code>tool.frame</code> message is usually a wrapper, not the real cause.
      </p>
    ),
  },
  {
    q: "The screenshot shows the wrong angle",
    a: (
      <p>
        <code>take_screenshot</code> always renders from the scene&apos;s Main Camera — one fixed
        angle. Use <code>screenshot_from</code> instead: it moves the camera to frame a target object
        or point, captures, and restores it. (<code>frame_camera</code> only moves the editor viewport,
        which the screenshot doesn&apos;t use.)
      </p>
    ),
  },
  {
    q: "Scene edit refused — “not allowed while play mode is active”",
    a: (
      <p>
        The bridge deliberately refuses scene-mutating commands while the game is playing — mutating
        the scene during play can corrupt <code>.scene</code> files on save. Call <code>stop_play</code>,
        make your edits, then <code>start_play</code> again. Read-only tools, screenshots, and
        runtime-property tools are safe during play.
      </p>
    ),
  },
  {
    q: "“I had to install it twice” / the menu never appears",
    a: (
      <p>
        An older installer copied the addon into s&amp;box&apos;s global <code>addons/</code> folder,
        which is built-in only and silently refuses to compile custom C#. The addon must live in your{" "}
        <strong className="text-neutral-300">project&apos;s</strong> <code>Libraries/claudebridge/</code>{" "}
        folder — reinstall from the Asset Library (or run the installer with the remove-stale flag).
      </p>
    ),
  },
  {
    q: "“Unknown command” or the tool count looks low (version drift)",
    a: (
      <p>
        Keep the addon and the MCP server on the same major.minor. <em>&ldquo;Unknown command&rdquo;</em>{" "}
        round-tripping to the editor means the server is newer than the addon — reinstall the addon. A{" "}
        <code>handlerCount</code> well below the documented number means the addon didn&apos;t fully
        compile — check <code>get_compile_errors</code>. If you upgrade one half, upgrade both.
      </p>
    ),
  },
  {
    q: "“mcp add sbox” succeeds, but no sbox tools exist",
    a: (
      <p>
        The MCP server process started and immediately exited — usually a missing build
        (<code>dist/index.js</code>), a wrong/relative path, or Node older than 18. If you use the
        plugin, run <code>/reload-plugins</code> or restart Claude Code.
      </p>
    ),
  },
  {
    q: "Particles are invisible",
    a: (
      <p>
        The experimental runtime <code>ParticleEffect</code> tools (<code>spawn_particle</code>,{" "}
        <code>add_trail</code>, <code>add_beam</code>) don&apos;t render through the bridge. Use{" "}
        <code>spawn_vpcf</code> — it plays a compiled <code>.vpcf</code>, the supported visible
        particle path. Author the effect in s&amp;box&apos;s particle editor, then Claude can spawn it.
      </p>
    ),
  },
  {
    q: "“Couldn’t add project” / compiler-name collision on startup",
    a: (
      <p>
        The project has both a local-dev <code>Libraries/claudebridge/</code> and an
        asset-library-installed copy claiming the same compiler name. Keep one — either set the local
        copy&apos;s <code>Org</code> to <code>local</code>, or remove the asset-library copy.
      </p>
    ),
  },
];

export default function TroubleshootingPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Troubleshooting</h1>
      <p className="mt-3 max-w-2xl text-neutral-400">
        Common failure modes and their fixes, roughly by how often they hit.{" "}
        <strong className="text-neutral-300">Your first stop is always</strong>{" "}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.85em] text-purple-300">get_bridge_status</code>{" "}
        — it reports the IPC dir, heartbeat age, version, and a real round-trip result.
      </p>

      <div className="mt-10 space-y-4 [&_code]:rounded [&_code]:bg-neutral-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:text-purple-300">
        {ITEMS.map((item, i) => (
          <details
            key={i}
            className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50"
            {...(i === 0 ? { open: true } : {})}
          >
            <summary className="flex cursor-pointer items-center justify-between px-6 py-4 font-medium text-white transition-colors hover:bg-neutral-800/50">
              <span>{item.q}</span>
              <span className="ml-4 text-xl text-neutral-500 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="px-6 pb-5 text-sm leading-relaxed text-neutral-400">{item.a}</div>
          </details>
        ))}
      </div>

      <div className="mt-12 border-t border-neutral-800 pt-8 text-sm text-neutral-400">
        Still stuck? Grab the full <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.85em] text-purple-300">get_bridge_status</code>{" "}
        result and <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.85em] text-purple-300">get_compile_errors</code>, then open an issue on{" "}
        <a
          href="https://github.com/LouSputthole/Sbox-Claude/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300"
        >
          GitHub
        </a>{" "}
        or email{" "}
        <a href="mailto:sboxskins@gmail.com" className="text-purple-400 hover:text-purple-300">
          sboxskins@gmail.com
        </a>
        . See also the{" "}
        <Link href="/claudebridge/faq" className="text-purple-400 hover:text-purple-300">
          FAQ
        </Link>
        .
      </div>
    </div>
  );
}

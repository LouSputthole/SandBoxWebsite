import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Every release of the Claude Bridge for s&box, newest first — from the v1.4 scene-authoring update through the v1.9 cookbook brain and v1.15 debug visualization to the v1.17 gameplay-verification harness.",
  alternates: { canonical: "/claudebridge/changelog" },
};

type Release = {
  version: string;
  tag: string;
  current?: boolean;
  points: string[];
};

const RELEASES: Release[] = [
  {
    version: "v1.17",
    tag: "gameplay verification",
    current: true,
    points: [
      "playtest / playtest_status — run a scripted gameplay loop in play mode (move / look / action / jump / set / wait / capture / assert) and get a pass/fail transcript. Assertions evaluate IN-FRAME, so transient state like a jump's airborne frame is catchable — impossible via separate tool calls. The first tool that verifies a playable loop, not just a static scene.",
      "Dogfooded live on a real game: walk → assert moved → jump → assert airborne the next frame → land → assert grounded, verdict PASS.",
      "v1.17.1 polish: a Displacement assert read (scalar distance moved from the loop's start — a clean, facing-independent movement proof) and a capture step that screenshots the live player POV mid-loop. 201 tools / 192 handlers.",
    ],
  },
  {
    version: "v1.16",
    tag: "bug-fix & polish",
    points: [
      "Vector params now accept the \"x,y,z\" string form everywhere — raycast / physics_overlap / screenshot_from / capture_view (and every vector-param tool) previously rejected the comma-string form their schemas advertise. Fixed centrally, verified live.",
      "Docs corrected (the bridge frame loop is static — the dock doesn't need to be open; create_material resolved); run_tests dropped as infeasible. No new tools (still 199 / 190).",
    ],
  },
  {
    version: "v1.15",
    tag: "debug visualization",
    points: [
      "debug_draw_line / ray / box / sphere draw world-space debug shapes (color + thickness); debug_clear wipes them.",
      "They render in the editor viewport AND in play mode (capturable via capture_view) — visualize a raycast hit, an overlap volume, a trigger's bounds, an NPC sight cone, or a patrol path.",
    ],
  },
  {
    version: "v1.14",
    tag: "playtest controls",
    points: [
      "set_time_scale — pause / slow-mo / fast-forward the running game (0 = pause, 0.1 = frame-by-frame, 2+ = fast-forward idle/economy ticks).",
      "get_profiler_stats — live engine performance counters: FPS, frame & GPU ms, allocations, memory, exceptions, and per-category timings.",
    ],
  },
  {
    version: "v1.13",
    tag: "the system-scaffold set, completed",
    points: [
      "+4 system scaffolds, all compile-verified live: create_leaderboard_panel, create_inventory, create_stat_modifier_system, create_placement_mode.",
      "Completes the scaffold stack the genre recipes compose from.",
    ],
  },
  {
    version: "v1.12",
    tag: "scaffolds, lints & a CI gate",
    points: [
      "+6 tools: create_interactable (the IPressable primitive), create_weighted_loot_table, create_save_system (versioned, sanitize-on-load, debounced autosave), plus sandbox_lint + razor_lint and copy_asset_with_dependencies.",
      "Correctness gates: a CI parity check (TS↔C# drift + a 4-way version lock) and a C# syntax gate, so a bad sync can't take the bridge down.",
      "Whitelist correction: System.Math / MathF compile on the current SDK (the old 'MathX only' advice was stale).",
    ],
  },
  {
    version: "v1.11",
    tag: "the game-director trio",
    points: [
      "create_round_phase_machine + create_day_night_clock join create_economy_wallet as a host-authoritative 'game director' set — currency, round/match flow, and time-of-day, all [Sync]-correct out of the box.",
      "The cookbook brain was fully re-mined across 51 shipped games.",
    ],
  },
  {
    version: "v1.10",
    tag: "call methods, drive input & the first mined scaffold",
    points: [
      "invoke_method (call a component method with arguments), ensure_input_action (register a .sbproj input action), drive_player (drive the live PlayerController across play-mode frames).",
      "create_economy_wallet — the first scaffold mined straight from the 51-game corpus.",
    ],
  },
  {
    version: "v1.9",
    tag: "the brain + see-and-verify",
    points: [
      "The companion plugin now bundles sbox-cookbook — a code-grounded recipe library mined from real, shipped open-source s&box games + the modern engine source.",
      "+6 inspection & validation tools: inspect_networked_object, networking_lint, scene_validate, save_inspect, services_query, simulate_input. The AI can now verify multiplayer, saves, and scenes instead of hoping.",
    ],
  },
  {
    version: "v1.7",
    tag: "play-mode eyes, AI brains & playable scaffolds",
    points: [
      "capture_view captures the live game in play mode (player POV + HUD), not just the edit scene.",
      "create_npc_brain generates a behavior state machine (patrol → chase → search) with FOV cone, line-of-sight, hearing, and 5 presets; plus patrol routes and wave spawners.",
      "Gameplay scaffolds (health, pickup, objective) + wiring tools turn placed objects into a playable loop; a run_self_test health check.",
    ],
  },
  {
    version: "v1.6",
    tag: "animation & better eyes",
    points: [
      "set_animgraph_param drives a Citizen's AnimationGraph; play_animation plays a named sequence; list_animations shows every animation a model has.",
      "screenshot_orbit captures an object from several angles in one call; get_bounds returns world-space size/center/extents.",
    ],
  },
  {
    version: "v1.5",
    tag: "reliability & autonomy",
    points: [
      "read_log + get_compile_errors surface compile failures even when the editor has stalled.",
      "screenshot_from aims the camera at any object/point; list_libraries detects installed addons; recompile_asset; navmesh bake + path queries.",
      "restart_editor lets the bridge restart s&box itself to apply changes; in-session docs search; a security & correctness hardening pass.",
    ],
  },
  {
    version: "v1.4",
    tag: "the Scene Authoring update (+32 tools)",
    points: [
      "Went from editing one object at a time to composing entire scenes: lighting & atmosphere, characters (spawn/dress/pose Citizens), scene layout, environment scatter, and object utilities.",
      "Verifiable-first: every non-experimental tool renders in the editor or returns concrete data.",
    ],
  },
  {
    version: "v1.3",
    tag: "stability & liveness",
    points: [
      "A real heartbeat replaced the old 'always connected' false positive.",
      "The request queue + heartbeat moved to a static frame handler, so tool calls process whether or not the Claude Bridge dock is open.",
      "Clearer timeouts that name which side failed; editor bootstrap crash fixed.",
    ],
  },
  {
    version: "v1.2 / v1.1",
    tag: "foundations",
    points: [
      "Reliable first-time install (correct Libraries/ target), scene-edits refused during play mode (no save corruption), fault tolerance (one broken tool can't take the rest down).",
      "A TROUBLESHOOTING guide, plus world-editing, terrain sculpting, forest painting, and live API/type discovery.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Changelog</h1>
      <p className="mt-3 max-w-2xl text-neutral-400">
        Every release of the Claude Bridge, newest first. No breaking changes across any of these —
        every existing tool still works.
      </p>

      <div className="mt-10 space-y-5">
        {RELEASES.map((r) => (
          <div
            key={r.version}
            className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6"
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-bold text-white">{r.version}</span>
              {r.current && (
                <span className="rounded-full border border-purple-500/40 bg-purple-500/15 px-2.5 py-0.5 text-xs font-medium text-purple-300">
                  Current
                </span>
              )}
              <span className="text-neutral-400">— {r.tag}</span>
            </div>
            <ul className="space-y-2 text-sm leading-relaxed text-neutral-400">
              {r.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-purple-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm text-neutral-500">
        Full technical release notes live in the{" "}
        <a
          href="https://github.com/LouSputthole/Sbox-Claude/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300"
        >
          CHANGELOG on GitHub
        </a>
        .
      </p>
    </div>
  );
}

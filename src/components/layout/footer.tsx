import { Gamepad2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-neutral-800 bg-[#0a0a0f] mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-semibold text-neutral-400">
              sboxskins.gg
            </span>
          </div>
          <p className="text-xs text-neutral-600 text-center">
            Not affiliated with Facepunch Studios or Valve Corporation. S&box is a trademark of Facepunch Studios.
            Market data may be delayed.
          </p>
        </div>
      </div>
    </footer>
  );
}

"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

interface TooltipProps {
  content: ReactNode;
  children?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  /** If true, renders a small help icon instead of wrapping children. */
  asIcon?: boolean;
}

/**
 * Lightweight tooltip — no external dependencies.
 * Shows on hover (mouse) and focus (keyboard).
 * Pass `asIcon` to render a help icon trigger automatically.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className = "",
  asIcon = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const sideClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses: Record<string, string> = {
    top: "top-full left-1/2 -translate-x-1/2 -mt-1 border-t-neutral-800 border-l-transparent border-r-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b-neutral-800 border-l-transparent border-r-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 -ml-1 border-l-neutral-800 border-t-transparent border-b-transparent border-r-transparent",
    right: "right-full top-1/2 -translate-y-1/2 -mr-1 border-r-neutral-800 border-t-transparent border-b-transparent border-l-transparent",
  };

  const trigger = asIcon ? (
    <button
      type="button"
      aria-label="More information"
      className={`inline-flex items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors ${className}`}
      onClick={(e) => {
        e.preventDefault();
        setOpen((o) => !o);
      }}
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </button>
  ) : (
    <span className={`inline-flex ${className}`}>{children}</span>
  );

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {trigger}
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 pointer-events-none ${sideClasses[side]}`}
        >
          <span className="block w-56 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300 shadow-xl leading-relaxed">
            {content}
          </span>
          <span
            className={`absolute h-0 w-0 border-4 ${arrowClasses[side]}`}
          />
        </span>
      )}
    </span>
  );
}

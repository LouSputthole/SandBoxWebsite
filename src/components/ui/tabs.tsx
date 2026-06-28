"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal shadcn-style Tabs (no Radix dependency). Works as a filter/sort
 * toggle group or a tabbed panel. Controlled (`value` + `onValueChange`) or
 * uncontrolled (`defaultValue`).
 *
 * Active chip = filled brand purple + white. Inactive = panel + hairline.
 */

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(component: string) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used within <Tabs>`);
  }
  return ctx;
}

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const current = value ?? internal;

  const setValue = React.useCallback(
    (v: string) => {
      if (value === undefined) setInternal(v);
      onValueChange?.(v);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value: current, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({
  className,
  onKeyDown,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  // Roving-tabindex keyboard nav: ArrowLeft/Right cycle through the tabs,
  // Home/End jump to the first/last. Selection follows focus (each move
  // clicks the target, which flips the active state + roving tabIndex).
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e);
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        '[role="tab"]:not([disabled])'
      )
    );
    if (tabs.length === 0) return;
    const current = tabs.indexOf(document.activeElement as HTMLElement);
    let next = current;
    if (e.key === "ArrowLeft") next = current <= 0 ? tabs.length - 1 : current - 1;
    else if (e.key === "ArrowRight")
      next = current === tabs.length - 1 ? 0 : current + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (tabs[next] && next !== current) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  }

  return (
    <div
      role="tablist"
      className={cn("inline-flex flex-wrap items-center gap-2", className)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function TabsTrigger({
  value,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const { value: active, setValue } = useTabsContext("TabsTrigger");
  const isActive = active === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[11px] border px-3.5 py-1.5 font-sans text-sm font-semibold transition-colors",
        isActive
          ? "border-transparent bg-[var(--accent)] text-white"
          : "border-[var(--line)] bg-[var(--panel)] text-[var(--mut)] hover:text-[var(--tx)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { value: active } = useTabsContext("TabsContent");
  if (active !== value) return null;
  return <div role="tabpanel" className={className} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

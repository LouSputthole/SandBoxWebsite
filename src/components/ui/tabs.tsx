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
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex flex-wrap items-center gap-2", className)}
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

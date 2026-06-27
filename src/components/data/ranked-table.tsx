import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled table shell for Leaderboard / Whales / Watchlist. A CSS-grid table
 * (not <table>) so each page can declare its own column widths. Faint mono
 * uppercase header, `--line2` row dividers, hover `--bg2`, mono right-aligned
 * numerics, and medal-tinted rank chips for the top three.
 *
 * Two ways to use it:
 *   1. Config-driven `<RankedTable columns={…} rows={…} />`.
 *   2. Compose the primitives directly (RankedTableShell / RankedHeaderRow /
 *      RankedHeadCell / RankedRow / RankedCell) plus <RankBadge>.
 *
 * Presentational only — no hooks, server-component friendly. `rowHref` makes
 * rows anchors; for JS click handlers use the primitives in a client page.
 */

type Align = "left" | "right" | "center";

const ALIGN: Record<Align, string> = {
  left: "justify-start text-left",
  right: "justify-end text-right",
  center: "justify-center text-center",
};

/* ------------------------------------------------------------------ */
/* RankBadge                                                           */
/* ------------------------------------------------------------------ */

const RANK_PALETTE: Record<number, [string, string]> = {
  1: ["#FBBF24", "rgba(251,191,36,.16)"], // gold
  2: ["#C7CCD4", "rgba(199,204,212,.14)"], // silver
  3: ["#D08B5B", "rgba(208,139,91,.16)"], // bronze
};

export interface RankBadgeProps {
  rank: number;
  className?: string;
}

/** Medal-tinted chip for ranks 1–3; plain mono faint for 4+. */
export function RankBadge({ rank, className }: RankBadgeProps) {
  const pal = RANK_PALETTE[rank];
  return (
    <span
      className={cn(
        "inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] font-mono text-[13px] font-bold tabular-nums",
        !pal && "text-faint",
        className
      )}
      style={
        pal ? { color: pal[0], background: pal[1] } : undefined
      }
    >
      {rank}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export interface RankedTableShellProps {
  children: React.ReactNode;
  className?: string;
}

/** Outer panel: rounded, hairline border, clipped corners. */
export function RankedTableShell({ children, className }: RankedTableShellProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border border-line bg-panel",
        className
      )}
    >
      {children}
    </div>
  );
}

interface GridRowProps {
  /** CSS grid-template-columns track list, e.g. "60px 1fr 120px". */
  gridTemplate: string;
  /** Gap between columns, px. */
  gap?: number;
  className?: string;
  children: React.ReactNode;
}

/** The faint mono uppercase header row. */
export function RankedHeaderRow({
  gridTemplate,
  gap = 14,
  className,
  children,
}: GridRowProps) {
  return (
    <div
      className={cn(
        "grid items-center border-b border-line px-5 py-[13px] font-mono text-[11px] uppercase tracking-[.4px] text-faint",
        className
      )}
      style={{ gridTemplateColumns: gridTemplate, gap }}
    >
      {children}
    </div>
  );
}

export interface RankedHeadCellProps {
  align?: Align;
  className?: string;
  children?: React.ReactNode;
}

export function RankedHeadCell({
  align = "left",
  className,
  children,
}: RankedHeadCellProps) {
  return (
    <div className={cn("flex items-center", ALIGN[align], className)}>
      {children}
    </div>
  );
}

export interface RankedRowProps extends GridRowProps {
  /** Renders the row as an anchor when set. */
  href?: string;
  /** Click handler (turns the host page into a client boundary). */
  onClick?: React.MouseEventHandler;
}

/** A body row — hover highlight + faint divider. Anchor when `href` is set. */
export function RankedRow({
  gridTemplate,
  gap = 14,
  href,
  onClick,
  className,
  children,
}: RankedRowProps) {
  const cls = cn(
    "grid items-center border-b border-line2 px-5 py-[13px] transition-colors last:border-b-0 hover:bg-bg2",
    href && "cursor-pointer",
    className
  );
  const style = { gridTemplateColumns: gridTemplate, gap };
  if (href) {
    return (
      <a href={href} className={cls} style={style} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <div className={cls} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export interface RankedCellProps {
  align?: Align;
  /** Apply JetBrains-mono numeric styling. */
  mono?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function RankedCell({
  align = "left",
  mono,
  className,
  children,
}: RankedCellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        ALIGN[align],
        mono && "font-mono",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Config-driven table                                                */
/* ------------------------------------------------------------------ */

export interface RankedColumn<T> {
  /** Stable key for React + grid cells. */
  key: string;
  /** Header content (faint mono uppercase). */
  header?: React.ReactNode;
  /** CSS grid track for this column, e.g. "60px", "1fr", "120px". */
  width: string;
  align?: Align;
  /** Mono numeric styling on the body cell. */
  mono?: boolean;
  headClassName?: string;
  cellClassName?: string;
  /** Render the cell for a given row. */
  cell: (row: T, index: number) => React.ReactNode;
}

export interface RankedTableProps<T> {
  columns: RankedColumn<T>[];
  rows: T[];
  /** Stable key per row. */
  rowKey: (row: T, index: number) => React.Key;
  /** Optional per-row link. */
  rowHref?: (row: T, index: number) => string | undefined;
  /** Grid gap between columns, px. */
  gap?: number;
  /** Shown when `rows` is empty. */
  emptyMessage?: React.ReactNode;
  className?: string;
}

export function RankedTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  gap = 14,
  emptyMessage = "No data.",
  className,
}: RankedTableProps<T>) {
  const gridTemplate = columns.map((c) => c.width).join(" ");

  return (
    <RankedTableShell className={className}>
      <RankedHeaderRow gridTemplate={gridTemplate} gap={gap}>
        {columns.map((c) => (
          <RankedHeadCell
            key={c.key}
            align={c.align}
            className={c.headClassName}
          >
            {c.header}
          </RankedHeadCell>
        ))}
      </RankedHeaderRow>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-mut">
          {emptyMessage}
        </div>
      ) : (
        rows.map((row, i) => (
          <RankedRow
            key={rowKey(row, i)}
            gridTemplate={gridTemplate}
            gap={gap}
            href={rowHref?.(row, i)}
          >
            {columns.map((c) => (
              <RankedCell
                key={c.key}
                align={c.align}
                mono={c.mono}
                className={c.cellClassName}
              >
                {c.cell(row, i)}
              </RankedCell>
            ))}
          </RankedRow>
        ))
      )}
    </RankedTableShell>
  );
}

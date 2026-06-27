"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Arcade numbered pager — Prev · "Page X of Y" · Next. Page state lives in the
 * URL (?page=) so any paged view is shareable / deep-linkable (restores the
 * old grid's deep paging, now for both grid and table).
 */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 pt-9 pb-2">
      <Button
        variant="secondary"
        size="sm"
        className="gap-1"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </Button>
      <span className="font-mono text-xs text-[var(--mut)]">
        Page <span className="font-semibold text-[var(--tx)]">{page}</span> of{" "}
        <span className="font-semibold text-[var(--tx)]">{totalPages}</span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="gap-1"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

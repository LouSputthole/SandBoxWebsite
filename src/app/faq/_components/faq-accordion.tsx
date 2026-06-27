"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Arcade FAQ accordion. One panel open at a time (mockup: state.open index,
 * -1 = all closed); the open item's chevron rotates 180° over 200ms and its
 * body renders in --mut. Keeps the real SEO Q&A copy passed in from the page.
 */
export function FaqAccordion({
  items,
  defaultOpen = 0,
}: {
  items: FaqItem[];
  defaultOpen?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-panel">
      {items.map((item, i) => {
        const isOpen = i === open;
        return (
          <div key={i} className="border-b border-line2 last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${i}`}
              id={`faq-trigger-${i}`}
              onClick={() => setOpen((cur) => (cur === i ? -1 : i))}
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-[22px] py-[18px] text-left transition-colors hover:bg-bg2"
            >
              <span className="text-[15.5px] font-bold text-tx">
                {item.question}
              </span>
              <ChevronDown
                strokeWidth={2.4}
                className={`h-5 w-5 shrink-0 text-accent transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div
                id={`faq-panel-${i}`}
                role="region"
                aria-labelledby={`faq-trigger-${i}`}
                className="max-w-[680px] px-[22px] pb-5 text-sm leading-[1.65] text-mut"
              >
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

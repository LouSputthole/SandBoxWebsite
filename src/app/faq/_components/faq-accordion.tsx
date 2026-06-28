import { ChevronDown } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Arcade FAQ accordion built on native <details>/<summary> elements: every
 * answer is server-rendered (crawlable), multiple panels can be open at once,
 * and the toggles are natively keyboard-accessible. The chevron rotates 180°
 * via the group-open variant. The first item is open by default.
 */
export function FaqAccordion({
  items,
  defaultOpen = 0,
}: {
  items: FaqItem[];
  defaultOpen?: number;
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-panel">
      {items.map((item, i) => (
        <details
          key={i}
          open={i === defaultOpen}
          className="group border-b border-line2 last:border-b-0"
        >
          <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-4 px-[22px] py-[18px] text-left transition-colors hover:bg-bg2 [&::-webkit-details-marker]:hidden">
            <span className="text-[15.5px] font-bold text-tx">
              {item.question}
            </span>
            <ChevronDown
              strokeWidth={2.4}
              className="h-5 w-5 shrink-0 text-accent transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="max-w-[680px] px-[22px] pb-5 text-sm leading-[1.65] text-mut">
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}

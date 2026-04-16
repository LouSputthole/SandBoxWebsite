"use client";

import { formatPrice } from "@/lib/utils";

interface ItemSelectProps {
  name: string;
  defaultValue: string;
  otherParamName: string;
  otherParamValue: string | undefined;
  options: { slug: string; name: string; currentPrice: number | null }[];
}

/**
 * Controlled select that auto-submits its parent form on change.
 * Needs to be a client component because onChange is a client-only event.
 */
export function ItemSelect({
  name,
  defaultValue,
  otherParamName,
  otherParamValue,
  options,
}: ItemSelectProps) {
  return (
    <form method="get" action="/compare">
      {otherParamValue && <input type="hidden" name={otherParamName} value={otherParamValue} />}
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
        onChange={(e) => e.currentTarget.form?.submit()}
      >
        <option value="">— Select an item —</option>
        {options.map((it) => (
          <option key={it.slug} value={it.slug}>
            {it.name} {it.currentPrice ? `· ${formatPrice(it.currentPrice)}` : ""}
          </option>
        ))}
      </select>
    </form>
  );
}

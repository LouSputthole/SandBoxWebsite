"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { X, SlidersHorizontal } from "lucide-react";

interface FilterState {
  type: string;
  rarity: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
}

interface ItemFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onReset: () => void;
  className?: string;
}

const itemTypes = [
  { value: "", label: "All Types" },
  { value: "character", label: "Character" },
  { value: "clothing", label: "Clothing" },
  { value: "accessory", label: "Accessory" },
  { value: "weapon", label: "Weapon" },
  { value: "tool", label: "Tool" },
];

const rarities = [
  { value: "", label: "All Rarities" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "legendary", label: "Legendary" },
];

const sortOptions = [
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "volume-desc", label: "Most Popular" },
  { value: "change-desc", label: "Biggest Gains" },
];

export function ItemFilters({ filters, onFilterChange, onReset, className }: ItemFiltersProps) {
  const update = (key: keyof FilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = filters.type || filters.rarity || filters.minPrice || filters.maxPrice;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-neutral-400" />
          <h3 className="text-sm font-medium text-neutral-300">Filters</h3>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-xs text-neutral-500">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {/* Sort */}
        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">Sort By</label>
          <Select value={filters.sort} onChange={(e) => update("sort", e.target.value)}>
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Type */}
        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">Type</label>
          <Select value={filters.type} onChange={(e) => update("type", e.target.value)}>
            {itemTypes.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Rarity */}
        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">Rarity</label>
          <Select value={filters.rarity} onChange={(e) => update("rarity", e.target.value)}>
            {rarities.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Price Range */}
        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">Price Range</label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={filters.minPrice}
              onChange={(e) => update("minPrice", e.target.value)}
              min="0"
              step="0.01"
              className="text-xs"
            />
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxPrice}
              onChange={(e) => update("maxPrice", e.target.value)}
              min="0"
              step="0.01"
              className="text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

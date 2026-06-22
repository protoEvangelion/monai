import {
  Button,
  ListBox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RangeCalendar,
  SearchField,
  Select,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { ChevronRightIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { AmountRangeFilter, DateRangeFilter } from "./transactions.types";
import { formatAmountRangeLabel, formatDateRangeLabel } from "./transactions.utils";

export type CategoryFilterOption = {
  id: string;
  label: string;
};

export type OptionalColumnOption = {
  id: string;
  label: string;
};

export function ToolbarSearchField({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [draft, onChange, value]);

  return (
    <SearchField
      aria-label="Search transactions"
      value={draft}
      onChange={setDraft}
      variant="secondary"
      className="min-w-[16rem] shrink-0"
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder="Search" />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}

export function CategoryFilterSelect({
  categoryFilter,
  categorySearch,
  filteredCategoryFilterOptions,
  onCategoryFilterChange,
  onCategorySearchChange,
  selectedCategoryFilterLabel,
}: {
  categoryFilter: string;
  categorySearch: string;
  filteredCategoryFilterOptions: CategoryFilterOption[];
  onCategoryFilterChange: (value: string) => void;
  onCategorySearchChange: (value: string) => void;
  selectedCategoryFilterLabel: string;
}) {
  return (
    <Select
      aria-label="Filter by category"
      selectedKey={categoryFilter}
      onSelectionChange={(key) => onCategoryFilterChange(String(key ?? "all"))}
      variant="secondary"
      className="min-w-[13rem] shrink-0"
    >
      <Select.Trigger>
        <Select.Value>{selectedCategoryFilterLabel}</Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <div className="flex max-h-[min(30rem,calc(100vh-4rem))] min-h-0 flex-col">
          <div className="border-b border-divider px-3 py-2">
            <SearchField
              aria-label="Search categories"
              value={categorySearch}
              onChange={onCategorySearchChange}
              variant="secondary"
              fullWidth
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search categories" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
          <ListBox
            items={filteredCategoryFilterOptions}
            selectedKeys={[categoryFilter]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const [next] = Array.from(keys);
              if (next) onCategoryFilterChange(String(next));
            }}
            aria-label="Category filters"
            className="min-h-0 flex-1"
          >
            {(option) => (
              <ListBox.Item id={option.id} textValue={option.label}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
          </ListBox>
        </div>
      </Select.Popover>
    </Select>
  );
}

export function DateRangeFilterButton({
  dateFilter,
  onDateFilterChange,
}: {
  dateFilter: DateRangeFilter;
  onDateFilterChange: (value: DateRangeFilter) => void;
}) {
  return (
    <div className="min-w-[11rem] shrink-0">
      <Popover>
        <div className="relative">
          <PopoverTrigger>
            <Button variant="secondary" className="w-full justify-between pr-10">
              <span className="min-w-0 flex-1 truncate">
                {formatDateRangeLabel(dateFilter)}
              </span>
              <ChevronRightIcon size={14} className="rotate-90 text-default-400" />
            </Button>
          </PopoverTrigger>
          {dateFilter ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Clear date filter"
              onPress={() => onDateFilterChange(null)}
              className="absolute right-8 top-1/2 -translate-y-1/2"
            >
              <XIcon size={13} />
            </Button>
          ) : null}
        </div>
        <PopoverContent className="rounded-2xl border border-divider p-2 shadow-xl">
          <RangeCalendar
            aria-label="Choose transaction date range"
            value={
              dateFilter
                ? {
                    start: parseDate(dateFilter.start),
                    end: parseDate(dateFilter.end),
                  }
                : undefined
            }
            onChange={(value) =>
              onDateFilterChange({
                start: value.start.toString(),
                end: value.end.toString(),
              })
            }
          >
            <RangeCalendar.Header>
              <RangeCalendar.NavButton slot="previous" />
              <RangeCalendar.Heading />
              <RangeCalendar.NavButton slot="next" />
            </RangeCalendar.Header>
            <RangeCalendar.Grid>
              <RangeCalendar.GridHeader>
                {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
              </RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>
                {(date) => <RangeCalendar.Cell date={date} />}
              </RangeCalendar.GridBody>
            </RangeCalendar.Grid>
          </RangeCalendar>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AmountRangeFilterButton({
  amountFilter,
  onAmountFilterChange,
}: {
  amountFilter: AmountRangeFilter;
  onAmountFilterChange: (value: AmountRangeFilter) => void;
}) {
  const min = amountFilter?.min ?? "";
  const max = amountFilter?.max ?? "";
  const hasFilter = Boolean(min || max);

  const updateAmountFilter = (next: { min?: string; max?: string }) => {
    const value = {
      min: next.min ?? min,
      max: next.max ?? max,
    };
    onAmountFilterChange(value.min || value.max ? value : null);
  };

  return (
    <div className="min-w-[10rem] shrink-0">
      <Popover>
        <div className="relative">
          <PopoverTrigger>
            <Button variant="secondary" className="w-full justify-between pr-10">
              <span className="min-w-0 flex-1 truncate">
                {formatAmountRangeLabel(amountFilter)}
              </span>
              <ChevronRightIcon size={14} className="rotate-90 text-default-400" />
            </Button>
          </PopoverTrigger>
          {hasFilter ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Clear amount filter"
              onPress={() => onAmountFilterChange(null)}
              className="absolute right-8 top-1/2 -translate-y-1/2"
            >
              <XIcon size={13} />
            </Button>
          ) : null}
        </div>
        <PopoverContent className="w-64 rounded-2xl border border-divider p-3 shadow-xl">
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
                Minimum
              </label>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={min}
                onChange={(event) => updateAmountFilter({ min: event.target.value })}
                placeholder="0"
                aria-label="Minimum amount"
                className="h-10 w-full rounded-xl border border-divider bg-background px-3 text-sm font-semibold outline-none transition-colors focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
                Maximum
              </label>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={max}
                onChange={(event) => updateAmountFilter({ max: event.target.value })}
                placeholder="No max"
                aria-label="Maximum amount"
                className="h-10 w-full rounded-xl border border-divider bg-background px-3 text-sm font-semibold outline-none transition-colors focus:border-primary"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

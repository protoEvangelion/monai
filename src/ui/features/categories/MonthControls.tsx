import { Button } from "@heroui/react";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { shiftMonth } from "./categories.utils";

export function MonthControls({
  transactions,
  viewDate,
  onViewDateChange,
  compact = false,
}: {
  transactions?: { date: Date | string }[];
  viewDate: string;
  onViewDateChange: (viewDate: string) => void;
  compact?: boolean;
}) {
  const current = new Date(viewDate);
  const label = current.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthViewDate = currentMonthStart.toISOString();
  const isCurrentMonth =
    current.getFullYear() === now.getFullYear() &&
    current.getMonth() === now.getMonth();
  const isAfterCurrentMonth =
    new Date(current.getFullYear(), current.getMonth(), 1) > currentMonthStart;

  useEffect(() => {
    if (isAfterCurrentMonth) onViewDateChange(currentMonthViewDate);
  }, [currentMonthViewDate, isAfterCurrentMonth, onViewDateChange]);

  const earliestDate = useMemo(() => {
    if (!transactions?.length) return null;
    return transactions.reduce<Date | null>((min, tx) => {
      const d = new Date(tx.date);
      return !min || d < min ? d : min;
    }, null);
  }, [transactions]);

  const goToEarliest = () => {
    if (!earliestDate) return;
    onViewDateChange(
      new Date(
        earliestDate.getFullYear(),
        earliestDate.getMonth(),
        1,
      ).toISOString(),
    );
  };

  return (
    <div
      className={[
        "flex items-center gap-1 rounded-2xl border border-divider/60 bg-default-50/70",
        compact ? "px-1.5 py-1" : "px-2 py-1.5",
      ].join(" ")}
    >
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Go to earliest month"
        isDisabled={!earliestDate}
        onPress={goToEarliest}
      >
        <ChevronsLeftIcon size={15} />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Previous month"
        onPress={() => onViewDateChange(shiftMonth(viewDate, -1))}
      >
        <ChevronLeftIcon size={16} />
      </Button>
      <div
        className={[
          "flex items-center justify-center gap-2 rounded-xl bg-background text-sm font-semibold text-default-700",
          compact ? "min-w-36 px-3 py-1" : "min-w-40 px-4 py-1.5",
        ].join(" ")}
      >
        <CalendarIcon size={14} className="text-default-500" />
        <span>{label}</span>
      </div>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Next month"
        isDisabled={isCurrentMonth || isAfterCurrentMonth}
        onPress={() => onViewDateChange(shiftMonth(viewDate, 1))}
      >
        <ChevronRightIcon size={16} />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Go to current month"
        isDisabled={isCurrentMonth}
        onPress={() => onViewDateChange(currentMonthViewDate)}
      >
        <ChevronsRightIcon size={15} />
      </Button>
    </div>
  );
}

import { Button } from "@heroui/react";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTimeTravel } from "../../hooks/useTimeTravel";
import { shiftMonth } from "./categories.utils";

export function MonthControls({
  transactions,
}: {
  transactions: { date: Date | string }[];
}) {
  const { viewDate, setViewDate, resetToCurrentMonth } = useTimeTravel();
  const current = new Date(viewDate);
  const label = current.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const now = new Date();
  const isCurrentMonth =
    current.getFullYear() === now.getFullYear() &&
    current.getMonth() === now.getMonth();

  const earliestDate = useMemo(() => {
    if (!transactions.length) return null;
    return transactions.reduce<Date | null>((min, tx) => {
      const d = new Date(tx.date);
      return !min || d < min ? d : min;
    }, null);
  }, [transactions]);

  const goToEarliest = () => {
    if (!earliestDate) return;
    setViewDate(
      new Date(
        earliestDate.getFullYear(),
        earliestDate.getMonth(),
        1,
      ).toISOString(),
    );
  };

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-divider/60 bg-default-50/70 px-2 py-1.5">
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
        onPress={() => setViewDate(shiftMonth(viewDate, -1))}
      >
        <ChevronLeftIcon size={16} />
      </Button>
      <div className="flex min-w-40 items-center justify-center gap-2 rounded-xl bg-background px-4 py-1.5 text-sm font-semibold text-default-700">
        <CalendarIcon size={14} className="text-default-500" />
        <span>{label}</span>
      </div>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Next month"
        onPress={() => setViewDate(shiftMonth(viewDate, 1))}
      >
        <ChevronRightIcon size={16} />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Go to current month"
        isDisabled={isCurrentMonth}
        onPress={resetToCurrentMonth}
      >
        <ChevronsRightIcon size={15} />
      </Button>
    </div>
  );
}

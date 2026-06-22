import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@heroui/react";
import { ArrowLeftIcon, ArrowRightIcon, Columns3Icon } from "lucide-react";
import { StyledCheckbox } from "./transactions.controls";
import type { OptionalColumnOption } from "./TransactionsToolbarControls";

export function TransactionsColumnSettings({
  columnOrderOptions,
  onColumnOrderChange,
  onVisibleOptionalColumnIdsChange,
  optionalColumnOptions,
  visibleColumnOrder,
  visibleOptionalColumnIds,
}: {
  columnOrderOptions: readonly OptionalColumnOption[];
  onColumnOrderChange: (ids: string[]) => void;
  onVisibleOptionalColumnIdsChange: (ids: string[]) => void;
  optionalColumnOptions: readonly OptionalColumnOption[];
  visibleColumnOrder: string[];
  visibleOptionalColumnIds: string[];
}) {
  const optionalColumnIds = new Set(optionalColumnOptions.map((column) => column.id));
  const visibleOptionalColumnIdSet = new Set(visibleOptionalColumnIds);
  const visibleOrderSet = new Set(visibleColumnOrder);
  const orderedColumns = [
    ...visibleColumnOrder
      .map((id) => columnOrderOptions.find((column) => column.id === id))
      .filter((column): column is OptionalColumnOption => Boolean(column)),
    ...columnOrderOptions.filter((column) => !visibleOrderSet.has(column.id)),
  ];
  const visibleReorderableIds = orderedColumns
    .filter(
      (column) => !optionalColumnIds.has(column.id) || visibleOptionalColumnIdSet.has(column.id),
    )
    .map((column) => column.id);

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    const visibleIndex = visibleReorderableIds.indexOf(columnId);
    const targetVisibleId = visibleReorderableIds[visibleIndex + direction];
    if (visibleColumnOrder.indexOf(columnId) < 0 || !targetVisibleId) return;

    const nextOrder = visibleColumnOrder.filter((id) => id !== columnId);
    const insertionIndex =
      direction < 0 ? nextOrder.indexOf(targetVisibleId) : nextOrder.indexOf(targetVisibleId) + 1;
    nextOrder.splice(insertionIndex, 0, columnId);
    onColumnOrderChange(nextOrder);
  };

  const toggleOptionalColumn = (columnId: string, checked: boolean) => {
    const nextIds = checked
      ? [...visibleOptionalColumnIds, columnId]
      : visibleOptionalColumnIds.filter((id) => id !== columnId);
    onVisibleOptionalColumnIdsChange(
      optionalColumnOptions
        .filter((column) => nextIds.includes(column.id))
        .map((column) => column.id),
    );
  };

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="secondary" className="shrink-0 gap-2">
          <Columns3Icon size={15} />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 rounded-2xl border border-divider p-2 shadow-xl">
        <div className="flex flex-col gap-1">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
            Columns
          </div>
          {orderedColumns.map((column) => {
            const isOptional = optionalColumnIds.has(column.id);
            const isVisible = !isOptional || visibleOptionalColumnIdSet.has(column.id);
            const visibleIndex = visibleReorderableIds.indexOf(column.id);
            return (
              <div
                key={column.id}
                className="flex h-9 items-center gap-2 rounded-xl px-2 text-sm text-foreground hover:bg-default-100"
              >
                {isOptional ? (
                  <StyledCheckbox
                    checked={isVisible}
                    onChange={(checked) => toggleOptionalColumn(column.id, checked)}
                    aria-label={`Show ${column.label}`}
                  />
                ) : (
                  <span className="h-4 w-4" />
                )}
                <span
                  className={[
                    "min-w-0 flex-1 truncate",
                    isVisible ? "" : "text-default-400",
                  ].join(" ")}
                >
                  {column.label}
                </span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${column.label} left`}
                  isDisabled={!isVisible || visibleIndex <= 0}
                  onPress={() => moveColumn(column.id, -1)}
                >
                  <ArrowLeftIcon size={13} />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${column.label} right`}
                  isDisabled={
                    !isVisible ||
                    visibleIndex < 0 ||
                    visibleIndex >= visibleReorderableIds.length - 1
                  }
                  onPress={() => moveColumn(column.id, 1)}
                >
                  <ArrowRightIcon size={13} />
                </Button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

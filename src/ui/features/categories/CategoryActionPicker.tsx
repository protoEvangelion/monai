import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/react";
import { PieChartIcon, SearchIcon, CheckIcon, XIcon } from "lucide-react";
import { getCategories } from "../../../server/categories.fns";

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number];

export function CategoryActionPicker({
  categories,
  selectedCategoryId,
  onChange,
  ariaLabel,
}: {
  categories: LoadedGroup[];
  selectedCategoryId: number | null;
  onChange: (categoryId: number | null) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const groups = categories
    .filter((group) => group.name.toLowerCase() !== "income")
    .map((group) => ({
      ...group,
      children: group.children.filter(
        (child) =>
          !query ||
          child.name.toLowerCase().includes(query) ||
          group.name.toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.children.length > 0);

  return (
    <Popover
      isOpen={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger>
        <button
          type="button"
          aria-label={ariaLabel}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-divider/50 bg-background text-default-600 transition-colors hover:border-primary/40 hover:text-primary"
        >
          <PieChartIcon size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 overflow-hidden rounded-2xl border border-divider bg-content1 p-0 shadow-xl">
        <div className="flex max-h-[min(30rem,calc(100vh-4rem))] min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
            <SearchIcon size={16} className="text-default-400" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-default-400"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {groups.map((group) => (
              <div key={group.id} className="px-1.5 pb-1.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-default-400">
                  {group.icon} {group.name}
                </div>
                {group.children.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      onChange(category.id);
                      setOpen(false);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition-all ${
                      selectedCategoryId === category.id
                        ? "border-success/50 bg-success/10 text-success"
                        : "border-transparent text-default-700 hover:border-divider hover:bg-content2 hover:text-foreground"
                    }`}
                  >
                    <span className="text-base leading-none">
                      {category.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {category.name}
                    </span>
                    {selectedCategoryId === category.id ? (
                      <CheckIcon size={13} className="shrink-0" />
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-divider px-1.5 py-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-default-700 transition-all hover:border-divider hover:bg-content2 hover:text-foreground"
            >
              <XIcon size={14} className="shrink-0" />
              <span>Uncategorized</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

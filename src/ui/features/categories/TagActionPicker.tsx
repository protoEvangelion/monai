import { useCallback, useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import {
  TagIcon,
  SearchIcon,
  CheckIcon,
  PlusIcon,
  Loader2Icon,
  MoreVerticalIcon,
} from "lucide-react";
import {
  setTagForTransactions,
  createTag,
  getTags,
} from "../../../server/transactions.fns";
import { getTransactions } from "../../../server/transactions.fns";

type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number];
type LoadedTag = Awaited<ReturnType<typeof getTags>>[number];

const TAG_COLORS = [
  "#ff1f2d",
  "#ff5b0a",
  "#fb8500",
  "#c97909",
  "#bf8500",
  "#f6c500",
  "#8a9900",
  "#09a10f",
  "#12b3b0",
  "#2d8bed",
  "#5b4ff5",
  "#a735f4",
  "#d31fe9",
  "#f51bb8",
  "#f50f5d",
  "#6680b3",
];

function StyledCheckbox({
  checked,
  onChange,
  onClick,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border border-default-300 bg-content2 accent-primary"
    />
  );
}

function getTransactionTags(tx: LoadedTransaction): LoadedTag[] {
  return (tx.tags ?? [])
    .map((entry) => entry.tag)
    .filter((tag): tag is LoadedTag => Boolean(tag));
}

export function TagActionPicker({
  tags,
  targetTransactions,
  onRefresh,
}: {
  tags: LoadedTag[];
  targetTransactions: LoadedTransaction[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[11]);
  const [saving, setSaving] = useState(false);
  const transactionIds = targetTransactions.map((tx) => tx.id);
  const query = search.trim().toLowerCase();
  const filteredTags = tags.filter(
    (tag) => !query || tag.name.toLowerCase().includes(query),
  );

  const tagIsSelectedForAll = useCallback(
    (tagId: number) => {
      return (
        targetTransactions.length > 0 &&
        targetTransactions.every((tx) =>
          getTransactionTags(tx).some((tag) => tag.id === tagId),
        )
      );
    },
    [targetTransactions],
  );

  const toggleTag = async (tag: LoadedTag) => {
    if (!transactionIds.length) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (setTagForTransactions as any)({
        data: {
          transactionIds,
          tagId: tag.id,
          selected: !tagIsSelectedForAll(tag.id),
        },
      });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newTagName.trim() || !transactionIds.length) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (createTag as any)({
        data: { name: newTagName, color: newTagColor },
      });
      if (created?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (setTagForTransactions as any)({
          data: { transactionIds, tagId: created.id, selected: true },
        });
      }
      setNewTagName("");
      setNewTagColor(TAG_COLORS[11]);
      setCreating(false);
      setOpen(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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
            aria-label="Manage tags"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-divider/50 bg-background text-default-600 transition-colors hover:border-primary/40 hover:text-primary"
          >
            <TagIcon size={15} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 overflow-hidden rounded-2xl border border-divider bg-content1 p-0 shadow-xl">
          <div className="flex max-h-[min(28rem,calc(100vh-4rem))] min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <SearchIcon size={17} className="text-default-400" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-default-400"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {filteredTags.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-default-400">
                  No tags yet
                </div>
              ) : (
                filteredTags.map((tag) => {
                  const checked = tagIsSelectedForAll(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-default-100"
                    >
                      <StyledCheckbox
                        checked={checked}
                        onChange={() => toggleTag(tag)}
                        onClick={(event) => event.stopPropagation()}
                        ariaLabel={`Toggle tag ${tag.name}`}
                      />
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {tag.name}
                      </span>
                      <MoreVerticalIcon
                        size={14}
                        className="text-default-300 opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-divider px-3 py-3">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-default-100"
              >
                <PlusIcon size={17} className="text-default-500" />
                <span>New tag</span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Modal
        isOpen={creating}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !saving) setCreating(false);
        }}
      >
        <ModalBackdrop variant="opaque" className="bg-black/45">
          <ModalContainer placement="top" className="pt-10 sm:pt-16">
            <ModalDialog className="w-full max-w-xl overflow-hidden rounded-2xl border border-divider bg-background p-0 shadow-2xl">
              <div className="border-b border-divider px-7 py-5">
                <p className="text-xl font-bold text-foreground">
                  Create a new tag
                </p>
              </div>
              <ModalBody className="px-7 py-6">
                <label className="block">
                  <span className="mb-2 block text-base font-bold text-foreground">
                    Name
                  </span>
                  <Input
                    autoFocus
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="Tag name"
                    aria-label="Tag name"
                  />
                </label>
                <div className="mt-5">
                  <p className="mb-3 text-base font-bold text-foreground">
                    Color
                  </p>
                  <div className="grid grid-cols-8 gap-3">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Select color ${color}`}
                        onClick={() => setNewTagColor(color)}
                        className="flex aspect-square min-h-12 items-center justify-center rounded-xl"
                        style={{ backgroundColor: color }}
                      >
                        {newTagColor === color ? (
                          <CheckIcon size={22} className="text-white" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter className="justify-end border-t border-divider px-7 py-5">
                <Button
                  variant="primary"
                  onPress={handleCreate}
                  isDisabled={saving || !newTagName.trim()}
                >
                  {saving ? (
                    <Loader2Icon size={14} className="animate-spin" />
                  ) : null}
                  Create
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}

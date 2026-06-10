import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { useRouter } from "@tanstack/react-router";
import { Loader2Icon, PencilIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import { createCategory, updateCategory } from "../../../server/categories.fns";
type ModalState =
  | { mode: "create-group" }
  | { mode: "create-child"; parentId: number; parentName: string }
  | {
      mode: "edit-group";
      category: {
        id: number;
        name: string;
        icon: string | null;
        budgetAmount: number;
      };
    }
  | {
      mode: "edit-child";
      category: {
        id: number;
        name: string;
        icon: string | null;
        budgetAmount: number;
      };
    };

export function CategoryModal(props: {
  modal?: ModalState;
  onClose?: () => void;
  onSuccess?: () => void;
  mode?: "group" | "category";
}) {
  const router = useRouter();
  const onClose = props.onClose ?? (() => router.navigate({ to: "/categories" }));
  const search =
    typeof window !== "undefined" && window.location.search
      ? Object.fromEntries(new URLSearchParams(window.location.search))
      : {};
  const mode =
    props.mode ||
    (props.modal?.mode === "create-group" || props.modal?.mode === "edit-group"
      ? "group"
      : "category");
  const parentId =
    props.modal?.mode === "create-child"
      ? props.modal.parentId
      : search.parentId
        ? Number(search.parentId)
        : undefined;
  const parentName =
    props.modal?.mode === "create-child" ? props.modal.parentName : search.parentName || undefined;
  const isGroup = mode === "group";
  const existing =
    props.modal?.mode === "edit-group" || props.modal?.mode === "edit-child"
      ? props.modal.category
      : null;
  const isEdit = existing !== null;

  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [openPickerAbove, setOpenPickerAbove] = useState(false);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(existing?.name ?? "");
  const [budget, setBudget] = useState(existing?.budgetAmount ? String(existing.budgetAmount) : "");
  const [saving, setSaving] = useState(false);
  const numericBudget = Math.max(0, Number(budget) || 0);
  const sliderMax = Math.max(2000, Math.ceil(numericBudget / 500) * 500);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        iconBtnRef.current &&
        !iconBtnRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [showEmojiPicker]);

  const toggleEmojiPicker = () => {
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      return;
    }
    const rect = iconBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const pickerHeight = 360;
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      setOpenPickerAbove(spaceBelow < pickerHeight && spaceAbove > spaceBelow);
    }
    setShowEmojiPicker(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (updateCategory as any)({
          data: {
            id: existing.id,
            name: name.trim(),
            icon: icon.trim() || (isGroup ? "📁" : "📌"),
            budgetAmount: isGroup ? 0 : parseFloat(budget) || 0,
          },
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (createCategory as any)({
          data: {
            name: name.trim(),
            icon: icon.trim() || (isGroup ? "📁" : "📌"),
            budgetAmount: isGroup ? 0 : parseFloat(budget) || 0,
            parentId: !isGroup && parentId ? parentId : null,
          },
        });
      }
      if (props.onSuccess) props.onSuccess();
      else onClose();
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit
    ? isGroup
      ? "Edit Group"
      : "Edit Category"
    : isGroup
      ? "New Group"
      : parentName
        ? `New Category in ${parentName}`
        : "New Category";

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open && !saving && props.onClose) props.onClose();
      }}
    >
      <ModalBackdrop variant="opaque" className="bg-black/60">
        <ModalContainer placement="top" className="pt-10 sm:pt-14">
          <ModalDialog className="w-full max-w-sm rounded-2xl border border-divider/50 bg-background shadow-2xl p-0 overflow-visible">
            <div className="flex items-center justify-between px-5 py-4 border-b border-divider/50">
              <span className="font-semibold text-base">{title}</span>
              <Button
                variant="ghost"
                isIconOnly
                size="sm"
                className="rounded-lg -mr-1"
                onPress={onClose}
                isDisabled={saving}
              >
                <XIcon size={15} />
              </Button>
            </div>

            <ModalBody className="px-5 py-4 flex flex-col gap-4 overflow-visible">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1">
                  <label className="sr-only">Icon</label>
                  <div className="relative">
                    <button
                      ref={iconBtnRef}
                      type="button"
                      onClick={toggleEmojiPicker}
                      className="group w-14 h-10 relative flex items-center justify-center rounded-xl border border-default-200 bg-default-100 hover:bg-default-200 text-2xl transition-colors cursor-pointer"
                      aria-label="Choose emoji"
                    >
                      <span>{icon || (isGroup ? "📁" : "📌")}</span>
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <PencilIcon size={14} className="text-white" />
                      </span>
                    </button>
                    {showEmojiPicker && (
                      <div
                        ref={pickerRef}
                        className={`absolute left-0 z-50 ${openPickerAbove ? "bottom-full mb-2" : "top-full mt-2"}`}
                      >
                        <EmojiPicker
                          theme={Theme.AUTO}
                          width={320}
                          height={340}
                          onEmojiClick={(event: EmojiClickData) => {
                            setIcon(event.emoji);
                            setShowEmojiPicker(false);
                          }}
                          lazyLoadEmojis
                          searchPlaceholder="Search emoji…"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="sr-only">Name</label>
                  <Input
                    aria-label="Name"
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={isGroup ? "e.g. Food & Dining" : "Category name"}
                    required
                  />
                </div>
              </div>

              {!isGroup && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-default-400 font-medium">
                    Default Budget <span className="text-default-300">(optional)</span>
                  </label>
                  <div className="rounded-2xl border border-divider/50 bg-default-50/70 px-3 py-3">
                    <input
                      aria-label="Monthly budget slider"
                      type="range"
                      min={0}
                      max={sliderMax}
                      step={25}
                      value={numericBudget}
                      onChange={(event) => setBudget(event.target.value)}
                      className="budget-slider mb-3 w-full cursor-pointer"
                    />
                    <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-default-400">
                      <span>$0</span>
                      <span className="rounded-md bg-default-100 px-2 py-0.5 text-default-600">
                        ${numericBudget.toLocaleString()}
                      </span>
                      <span>${sliderMax.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-center">
                      <input
                        aria-label="Monthly budget"
                        type="number"
                        min="0"
                        step="1"
                        value={budget}
                        onChange={(event) => setBudget(event.target.value)}
                        placeholder="0"
                        className="w-40 rounded-xl border border-default-200 bg-default-100 px-3 py-2 text-center text-foreground outline-none transition-colors focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}
            </ModalBody>

            <ModalFooter
              style={{
                backgroundColor: "color-mix(in oklch, var(--background) 96%, white 4%)",
              }}
              className="flex gap-2 rounded-b-2xl border-t border-divider/50 px-5 py-4"
            >
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onPress={onClose}
                isDisabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onPress={handleSave}
                isDisabled={saving || !name.trim()}
              >
                {saving ? <Loader2Icon size={14} className="animate-spin" /> : null}
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

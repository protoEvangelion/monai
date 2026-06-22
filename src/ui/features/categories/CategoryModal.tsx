import { useRouter } from "@tanstack/react-router";
import { Loader2Icon, XIcon } from "lucide-react";
import { useState } from "react";
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
import { CategoryBudgetField } from "./CategoryBudgetField";
import { CategoryEmojiPicker } from "./CategoryEmojiPicker";
type CategoryGroupOption = {
  id: number;
  name: string;
  icon: string | null;
};

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
        parentId: number | null;
      };
    };

export function CategoryModal(props: {
  modal?: ModalState;
  groups?: CategoryGroupOption[];
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
  const [name, setName] = useState(existing?.name ?? "");
  const [budget, setBudget] = useState(existing?.budgetAmount ? String(existing.budgetAmount) : "");
  const [selectedParentId, setSelectedParentId] = useState<number | null>(() => {
    if (isGroup) return null;
    if (props.modal?.mode === "edit-child") return props.modal.category.parentId;
    if (typeof parentId === "number") return parentId;
    return props.groups?.[0]?.id ?? null;
  });
  const [saving, setSaving] = useState(false);
  const numericBudget = Math.max(0, Number(budget) || 0);
  const sliderMax = Math.max(2000, Math.ceil(numericBudget / 500) * 500);

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
            parentId: isGroup ? null : selectedParentId,
          },
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (createCategory as any)({
          data: {
            name: name.trim(),
            icon: icon.trim() || (isGroup ? "📁" : "📌"),
            budgetAmount: isGroup ? 0 : parseFloat(budget) || 0,
            parentId: !isGroup ? selectedParentId : null,
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
                <CategoryEmojiPicker icon={icon} isGroup={isGroup} onIconChange={setIcon} />
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
                <>
                  {props.groups?.length ? (
                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
                        Group
                      </label>
                      <select
                        aria-label="Group"
                        value={selectedParentId ? String(selectedParentId) : ""}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) setSelectedParentId(next);
                        }}
                        className="h-11 w-full rounded-xl border border-divider bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary"
                      >
                        <option value="" disabled>
                          Choose group
                        </option>
                        {props.groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.icon ? `${group.icon} ` : ""}
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <CategoryBudgetField
                    budget={budget}
                    numericBudget={numericBudget}
                    onBudgetChange={setBudget}
                    sliderMax={sliderMax}
                  />
                </>
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
                isDisabled={saving || !name.trim() || (!isGroup && !selectedParentId)}
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

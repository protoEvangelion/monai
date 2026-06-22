import { Button, Input, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading } from "@heroui/react";
import type { CategoryGroup } from "./transactions.types";

export function CreateCategoryFromTransactionModal({
  categories,
  isCreatingCategory,
  isOpen,
  newCategoryBudget,
  newCategoryIcon,
  newCategoryName,
  newCategoryParentId,
  onCreate,
  onOpenChange,
  setNewCategoryBudget,
  setNewCategoryIcon,
  setNewCategoryName,
  setNewCategoryParentId,
}: {
  categories: CategoryGroup[];
  isCreatingCategory: boolean;
  isOpen: boolean;
  newCategoryBudget: string;
  newCategoryIcon: string;
  newCategoryName: string;
  newCategoryParentId: number | null;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  setNewCategoryBudget: (value: string) => void;
  setNewCategoryIcon: (value: string) => void;
  setNewCategoryName: (value: string) => void;
  setNewCategoryParentId: (value: number | null) => void;
}) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalBackdrop variant="opaque" className="bg-black/55">
        <ModalContainer placement="center">
          <ModalDialog className="max-w-xl overflow-hidden rounded-3xl border border-divider bg-content1 p-0 text-foreground shadow-2xl">
            <ModalHeader className="flex items-center justify-between border-b border-divider px-7 py-6">
              <ModalHeading className="text-4 font-bold text-foreground">New category</ModalHeading>
              <button
                onClick={() => {
                  if (isCreatingCategory) return;
                  onOpenChange(false);
                }}
                className="h-8 w-8 rounded-full text-default-400 transition-colors hover:bg-content2"
              >
                x
              </button>
            </ModalHeader>

            <ModalBody className="flex flex-col gap-5 px-7 py-6">
              <div className="flex items-center gap-4">
                <input
                  value={newCategoryIcon}
                  onChange={(event) => setNewCategoryIcon(event.target.value)}
                  maxLength={4}
                  className="h-16 w-16 rounded-3xl border border-divider bg-content2 text-center text-2xl outline-none"
                />
                <Input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Category name"
                  className="text-2xl font-semibold"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-2 font-semibold text-default-500">Group</label>
                <select
                  value={newCategoryParentId ?? ""}
                  onChange={(event) =>
                    setNewCategoryParentId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="h-14 rounded-2xl border border-divider bg-content2 px-4 text-foreground outline-none"
                >
                  {categories.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.icon} {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-2 font-semibold text-default-500">Budget</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={newCategoryBudget}
                  onChange={(event) => setNewCategoryBudget(event.target.value)}
                  placeholder="0"
                />
              </div>
            </ModalBody>

            <ModalFooter className="flex items-center justify-end gap-3 border-t border-divider bg-content1 px-7 py-5">
              <Button
                onPress={() => onOpenChange(false)}
                isDisabled={isCreatingCategory}
                className="rounded-xl bg-default-100 text-foreground hover:bg-default-200"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={onCreate}
                isDisabled={
                  isCreatingCategory || !newCategoryName.trim() || newCategoryParentId === null
                }
                className="rounded-xl"
              >
                {isCreatingCategory ? "Creating..." : "Create"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

import { useCallback, useState } from "react";
import { deleteCategory } from "../../../server/categories.fns";

export type ModalState =
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

export function useCategoryModal(refresh: () => void) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const closeModal = useCallback(() => setModal(null), []);

  const handleModalSuccess = useCallback(() => {
    setModal(null);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: number, isGroup: boolean) => {
      const msg = isGroup
        ? "Delete this group and all its categories? Transactions will be uncategorized."
        : "Delete this category? Transactions will be uncategorized.";
      if (!confirm(msg)) return;

      setDeletingId(id);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (deleteCategory as any)({ data: { id } });
        refresh();
      } finally {
        setDeletingId(null);
      }
    },
    [refresh],
  );

  return {
    modal,
    setModal,
    deletingId,
    closeModal,
    handleModalSuccess,
    handleDelete,
  };
}

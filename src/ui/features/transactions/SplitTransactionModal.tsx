import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from "@heroui/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../../../lib/format";
import { CategoryActionPicker } from "../categories/CategoryActionPicker";
import { CurrencyNumberInput } from "../../shared/CurrencyNumberInput";
import type { CategoryGroup, Tx } from "./transactions.types";
import { transactionDisplayName } from "./transactions.utils";

type SplitLegDraft = {
  key: string;
  amount: string;
  categoryId: number | null;
};

function cents(value: number) {
  return Math.round(value * 100);
}

function parseAmountInput(raw: string, parentSign: number) {
  const absolute = Math.abs(Number(raw) || 0);
  return absolute === 0 ? 0 : absolute * parentSign;
}

function newLeg(seed?: Partial<SplitLegDraft>): SplitLegDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    amount: "",
    categoryId: null,
    ...seed,
  };
}

export function SplitTransactionModal({
  categories,
  isOpen,
  isSaving,
  onOpenChange,
  onSplit,
  transaction,
}: {
  categories: CategoryGroup[];
  isOpen: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSplit: (splits: Array<{ amount: number; categoryId: number }>) => void | Promise<void>;
  transaction: Tx | null;
}) {
  const parentSign = transaction ? Math.sign(transaction.amount) || 1 : 1;
  const parentAbs = transaction ? Math.abs(transaction.amount) : 0;
  const [legs, setLegs] = useState<SplitLegDraft[]>([newLeg(), newLeg()]);

  useEffect(() => {
    if (!isOpen || !transaction) return;
    const totalCents = cents(Math.abs(transaction.amount));
    const firstCents = Math.floor(totalCents / 2);
    const secondCents = totalCents - firstCents;
    setLegs([
      newLeg({
        amount: (firstCents / 100).toFixed(2),
        categoryId: transaction.categoryId ?? null,
      }),
      newLeg({ amount: (secondCents / 100).toFixed(2) }),
    ]);
  }, [isOpen, transaction]);

  const parsedLegs = useMemo(
    () =>
      legs.map((leg) => ({
        ...leg,
        amountValue: parseAmountInput(leg.amount, parentSign),
      })),
    [legs, parentSign],
  );

  const allocatedAbs = parsedLegs.reduce((sum, leg) => sum + Math.abs(leg.amountValue), 0);
  const remainingAbs = Number((parentAbs - allocatedAbs).toFixed(2));
  const isBalanced = cents(allocatedAbs) === cents(parentAbs);
  const canSave =
    Boolean(transaction) &&
    !isSaving &&
    isBalanced &&
    parsedLegs.length >= 2 &&
    parsedLegs.every((leg) => leg.amountValue !== 0 && leg.categoryId != null);

  const updateLeg = (key: string, patch: Partial<SplitLegDraft>) => {
    setLegs((prev) => prev.map((leg) => (leg.key === key ? { ...leg, ...patch } : leg)));
  };

  const handleSave = async () => {
    if (!canSave || !transaction) return;
    await onSplit(
      parsedLegs.map((leg) => ({
        amount: leg.amountValue,
        categoryId: leg.categoryId!,
      })),
    );
  };

  if (!transaction) return null;

  const categoryLabel = (categoryId: number | null) => {
    if (categoryId == null) return "Category";
    for (const group of categories) {
      const child = group.children.find((item) => item.id === categoryId);
      if (child) return `${child.icon ?? ""} ${child.name}`.trim();
    }
    return "Category";
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalBackdrop variant="opaque" className="bg-black/55">
        <ModalContainer placement="center">
          <ModalDialog className="max-w-lg overflow-hidden rounded-3xl border border-divider bg-content1 p-0 text-foreground shadow-2xl">
            <ModalHeader className="flex items-center justify-between border-b border-divider px-6 py-5">
              <div className="min-w-0">
                <ModalHeading className="text-xl font-bold text-foreground">
                  Split transaction
                </ModalHeading>
                <p className="mt-1 truncate text-sm text-default-500">
                  {transactionDisplayName(transaction)} · {formatCurrency(Math.abs(transaction.amount))}
                </p>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-full text-default-400 transition-colors hover:bg-content2"
                aria-label="Close split modal"
              >
                ×
              </button>
            </ModalHeader>

            <ModalBody className="flex flex-col gap-4 px-6 py-5">
              {parsedLegs.map((leg, index) => (
                <div
                  key={leg.key}
                  className="flex flex-col gap-2 rounded-2xl border border-divider/60 bg-default-50/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-default-400">
                      Leg {index + 1}
                    </p>
                    {legs.length > 2 ? (
                      <button
                        type="button"
                        aria-label={`Remove leg ${index + 1}`}
                        disabled={isSaving}
                        onClick={() => setLegs((prev) => prev.filter((item) => item.key !== leg.key))}
                        className="rounded-lg p-1.5 text-default-400 transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2Icon size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <CurrencyNumberInput
                      ariaLabel={`Split leg ${index + 1} amount`}
                      value={leg.amount}
                      onChange={(value) => updateLeg(leg.key, { amount: value })}
                      onEnter={() => {}}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-divider bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
                    />
                    <div className="flex items-center gap-2">
                      <CategoryActionPicker
                        categories={categories}
                        selectedCategoryId={leg.categoryId}
                        ariaLabel={`Split leg ${index + 1} category`}
                        onChange={(categoryId) => updateLeg(leg.key, { categoryId })}
                      />
                      <span className="max-w-28 truncate text-xs font-semibold text-default-600">
                        {categoryLabel(leg.categoryId)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="self-start rounded-xl"
                isDisabled={isSaving}
                onPress={() => setLegs((prev) => [...prev, newLeg()])}
              >
                <PlusIcon size={14} />
                Add leg
              </Button>

              <div
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  isBalanced
                    ? "bg-success-soft text-success"
                    : remainingAbs > 0
                      ? "bg-warning-soft text-warning"
                      : "bg-danger-soft text-danger"
                }`}
              >
                {isBalanced
                  ? "Splits balance the original amount"
                  : remainingAbs > 0
                    ? `${formatCurrency(remainingAbs)} remaining`
                    : `${formatCurrency(Math.abs(remainingAbs))} over`}
              </div>
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2 border-t border-divider px-6 py-4">
              <Button
                variant="ghost"
                isDisabled={isSaving}
                onPress={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={!canSave}
                onPress={() => void handleSave()}
              >
                {isSaving ? "Splitting..." : "Split"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

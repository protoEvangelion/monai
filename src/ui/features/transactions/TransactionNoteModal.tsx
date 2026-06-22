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
  TextArea,
} from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { formatCurrency } from "../../../lib/format";
import { updateTransactionNote } from "../../../server/transactions.fns";
import { showToast } from "../../shared/toast";
import type { Tx } from "./transactions.types";
import {
  dateColumnLabel,
  getErrorMessage,
  transactionDisplayName,
} from "./transactions.utils";

const MAX_NOTE_LENGTH = 1_000;

export function TransactionNoteModal({
  onClose,
  transaction,
}: {
  onClose: () => void;
  transaction: Tx;
}) {
  const router = useRouter();
  const updateNote = useServerFn(updateTransactionNote);
  const [note, setNote] = useState(transaction.note ?? "");
  const [isSaving, startSaving] = useTransition();
  const hasChanges = note.trim() !== (transaction.note ?? "").trim();

  const handleSave = () => {
    if (!hasChanges || isSaving) return;
    startSaving(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (updateNote as any)({ data: { id: transaction.id, note } });
        await router.invalidate();
        onClose();
      } catch (error) {
        showToast({
          title: "Could not save note",
          description: getErrorMessage(error),
          tone: "danger",
        });
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSaving) onClose();
  };

  return (
    <Modal isOpen onOpenChange={handleOpenChange}>
      <ModalBackdrop variant="opaque" className="bg-black/55">
        <ModalContainer placement="center" className="px-4">
          <ModalDialog className="w-full max-w-xl overflow-hidden rounded-2xl border border-divider bg-content1 p-0 text-foreground shadow-2xl">
            <ModalHeader className="flex items-start justify-between gap-4 border-b border-divider px-6 py-5">
              <div className="min-w-0">
                <ModalHeading className="text-lg font-bold text-foreground">
                  Transaction note
                </ModalHeading>
                <p className="mt-1 truncate text-sm font-medium text-default-500">
                  {transactionDisplayName(transaction)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close note editor"
                disabled={isSaving}
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-content2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XIcon size={18} />
              </button>
            </ModalHeader>

            <ModalBody className="flex flex-col gap-4 px-6 py-5">
              <div className="flex items-center justify-between gap-4 text-xs font-semibold text-default-500">
                <span>{dateColumnLabel(transaction.date)}</span>
                <span className="tabular-nums">{formatCurrency(Math.abs(transaction.amount))}</span>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-foreground">Note</span>
                <TextArea
                  autoFocus
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") handleSave();
                  }}
                  maxLength={MAX_NOTE_LENGTH}
                  rows={7}
                  placeholder="Add context, receipt details, or a reminder..."
                  aria-label="Transaction note"
                  className="min-h-40 w-full resize-y rounded-xl border border-divider bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-default-400 focus:border-primary"
                />
                <span className="self-end text-xs tabular-nums text-default-400">
                  {note.length} / {MAX_NOTE_LENGTH}
                </span>
              </label>
            </ModalBody>

            <ModalFooter className="flex items-center justify-end gap-3 border-t border-divider px-6 py-4">
              <Button
                onPress={onClose}
                isDisabled={isSaving}
                className="rounded-lg bg-default-100 text-foreground hover:bg-default-200"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={handleSave}
                isDisabled={!hasChanges || isSaving}
                className="rounded-lg"
              >
                {isSaving ? "Saving..." : "Save note"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

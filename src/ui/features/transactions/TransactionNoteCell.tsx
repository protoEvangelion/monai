import { TextInput } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useTransition } from "react";
import { updateTransactionNote } from "../../../server/transactions.fns";
import { showToast } from "../../shared/toast";
import type { Tx } from "./transactions.types";
import { getErrorMessage } from "./transactions.utils";

const MAX_NOTE_LENGTH = 1_000;

export function TransactionNoteCell({ tx }: { tx: Tx }) {
  const router = useRouter();
  const updateNote = useServerFn(updateTransactionNote);
  const [value, setValue] = useState(tx.note ?? "");
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setValue(tx.note ?? "");
  }, [tx.id, tx.note]);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed === (tx.note ?? "").trim() || isSaving) return;
    startSaving(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (updateNote as any)({ data: { id: tx.id, note: value } });
        await router.invalidate();
      } catch (error) {
        showToast({
          title: "Could not save note",
          description: getErrorMessage(error),
          tone: "danger",
        });
        setValue(tx.note ?? "");
      }
    });
  };

  return (
    <TextInput
      aria-label={`Note for ${tx.merchantName}`}
      data-testid={`transaction-note-${tx.id}`}
      disabled={isSaving}
      maxLength={MAX_NOTE_LENGTH}
      placeholder="Add note..."
      size="xs"
      value={value}
      onBlur={save}
      onChange={(event) => setValue(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        event.stopPropagation();
      }}
    />
  );
}

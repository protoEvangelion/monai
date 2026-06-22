import { useMemo } from "react";
import type { Tx } from "./transactions.types";

export function useSelectedToolbarTransactions({
  cappedTransactionIds,
  selectAllPages,
  selectedIds,
  transactions,
}: {
  cappedTransactionIds: number[];
  selectAllPages: boolean;
  selectedIds: number[];
  transactions: Tx[];
}) {
  const selectedToolbarIds = selectAllPages ? cappedTransactionIds : selectedIds;
  const selectedToolbarIdSet = useMemo(() => new Set(selectedToolbarIds), [selectedToolbarIds]);

  return useMemo(
    () => transactions.filter((tx) => selectedToolbarIdSet.has(tx.id)),
    [selectedToolbarIdSet, transactions],
  );
}

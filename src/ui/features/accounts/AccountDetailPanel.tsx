import { Loader2Icon, MoreHorizontalIcon, Trash2Icon, XIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { ACCOUNT_TYPE_CONFIG } from "./accounts.config";
import type { AccountsData, TransactionsData } from "./accounts.types";

export function AccountDetailPanel({
  accountTransactions,
  isDeleting,
  onDeleteAccount,
  selectedAccount,
}: {
  accountTransactions: TransactionsData;
  isDeleting: number | null;
  onDeleteAccount: (accountId: number) => void;
  selectedAccount: AccountsData[number] | null;
}) {
  return (
    <aside className="hidden w-[430px] shrink-0 border-l border-divider/60 bg-content1 xl:block">
      {selectedAccount ? (
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-between border-b border-divider/60 px-5">
            <h2 className="truncate text-sm font-bold">{selectedAccount.name}</h2>
            <div className="flex items-center gap-3 text-default-400">
              <button
                type="button"
                onClick={() => onDeleteAccount(selectedAccount.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-danger/10 hover:text-danger"
              >
                {isDeleting === selectedAccount.id ? (
                  <Loader2Icon size={15} className="animate-spin" />
                ) : (
                  <Trash2Icon size={15} />
                )}
              </button>
              <MoreHorizontalIcon size={18} />
              <XIcon size={18} />
            </div>
          </div>
          <div className="border-b border-divider/60 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-default-400">
                  {ACCOUNT_TYPE_CONFIG[selectedAccount.type]?.label ?? "Account"}
                </div>
                <div className="mt-1 text-xl font-black">
                  {formatCurrency(selectedAccount.currentBalance)}
                </div>
                <div className="mt-1 text-xs text-default-400">
                  Imported balance plus historical snapshots
                </div>
              </div>
              <div className="rounded-full bg-content2 px-2.5 py-1 text-xs font-bold text-default-500">
                Current
              </div>
            </div>
            <div className="mt-5 h-32 rounded-2xl bg-default-50 p-2">
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-divider/70 text-center text-xs text-default-400">
                Account-specific balance chart pending
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <h3 className="mb-3 text-sm font-bold">Transactions</h3>
            {accountTransactions.slice(0, 18).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between border-b border-divider/40 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{tx.merchantName}</div>
                  <div className="text-xs text-default-400">
                    {new Date(tx.date).toLocaleDateString()}
                  </div>
                </div>
                <div
                  className={[
                    "text-sm font-bold",
                    tx.amount < 0 ? "text-success" : "text-foreground",
                  ].join(" ")}
                >
                  {tx.amount < 0 ? "+" : ""}
                  {formatCurrency(Math.abs(tx.amount))}
                </div>
              </div>
            ))}
            {accountTransactions.length === 0 ? (
              <div className="py-12 text-center text-sm text-default-400">
                No transactions for this account yet.
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-center text-sm text-default-400">
          Select to view details
        </div>
      )}
    </aside>
  );
}

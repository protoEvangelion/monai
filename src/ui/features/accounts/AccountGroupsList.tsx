import { ChevronRightIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import type { AccountGroup, AccountsData } from "./accounts.types";

export function AccountGroupsList({
  grouped,
  selectedAccount,
  onSelectAccount,
}: {
  grouped: Record<string, AccountGroup>;
  selectedAccount: AccountsData[number] | null;
  onSelectAccount: (accountId: number) => void;
}) {
  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([type, group]) => {
        const total = group.accounts.reduce((sum, account) => sum + account.currentBalance, 0);
        return (
          <section key={type}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <span className="text-default-400">{group.config.icon}</span>
                {group.config.label}
              </h2>
              <div
                className={[
                  "text-sm font-black",
                  group.config.isDebt ? "text-danger" : "text-foreground",
                ].join(" ")}
              >
                {formatCurrency(total)}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-divider/60 bg-content1">
              {group.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onSelectAccount(account.id)}
                  className={[
                    "flex w-full cursor-pointer items-center gap-4 border-b border-divider/40 px-4 py-4 text-left last:border-b-0 hover:bg-content2",
                    selectedAccount?.id === account.id ? "bg-primary/10" : "",
                  ].join(" ")}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                    {group.config.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{account.name}</div>
                    <div className="text-xs text-default-400">{account.type} · history retained</div>
                  </div>
                  <div className="w-28 text-right text-sm font-bold">
                    {formatCurrency(account.currentBalance)}
                  </div>
                  <ChevronRightIcon size={15} className="text-default-300" />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

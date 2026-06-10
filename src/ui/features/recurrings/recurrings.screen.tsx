import { useEffect, useMemo, useState } from "react";
import { CalendarClockIcon, CirclePlusIcon, SearchIcon, XIcon } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { getTransactions } from "../../../server/transactions.fns";

type TransactionsData = Awaited<ReturnType<typeof getTransactions>>;

function transactionTypeLabel(type: string) {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfer";
  return "Regular";
}

export function RecurringsScreen({ transactions }: { transactions: TransactionsData }) {
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState("");
  const recurringTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.isRecurring),
    [transactions],
  );
  const upcomingTotal = recurringTransactions.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );
  const candidates = transactions
    .filter((transaction) => transaction.merchantName.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12);

  useEffect(() => {
    if (!isAdding) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAdding(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isAdding]);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-3xl border border-divider/60 bg-background/70 shadow-sm">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-divider/60 bg-background/90 px-6 backdrop-blur-xl">
          <h1 className="text-lg font-bold">Recurrings</h1>
          <button
            type="button"
            aria-label="Add a recurring"
            onClick={() => setIsAdding(true)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-95"
          >
            <CirclePlusIcon size={18} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-3xl border border-divider/60 bg-content1 p-8">
            <div className="text-center">
              <div className="text-3xl font-black">
                {formatCurrency(upcomingTotal, { maximumFractionDigits: 0 })}
              </div>
              <div className="mt-1 text-sm font-semibold text-default-400">left to pay</div>
            </div>
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-[14px] border-content2">
              <CalendarClockIcon size={24} className="text-default-300" />
            </div>
            <div className="text-center">
              <div className="text-3xl font-black">
                {formatCurrency(0, { maximumFractionDigits: 0 })}
              </div>
              <div className="mt-1 text-sm font-semibold text-default-400">paid so far</div>
            </div>
          </div>

          {recurringTransactions.length ? (
            <div className="overflow-hidden rounded-2xl border border-divider/60 bg-content1">
              {recurringTransactions.map((transaction) => (
                <button
                  key={transaction.id}
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between border-b border-divider/40 px-5 py-4 text-left last:border-b-0 hover:bg-content2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{transaction.merchantName}</div>
                    <div className="mt-0.5 text-xs text-default-400">
                      Monthly · next expected {new Date(transaction.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-sm font-black">
                    {formatCurrency(Math.abs(transaction.amount))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-content2 text-default-300">
                <CalendarClockIcon size={30} />
              </div>
              <h2 className="mt-5 text-base font-bold">You have no Recurrings set up.</h2>
              <p className="mt-2 max-w-sm text-sm text-default-400">
                Select a transaction to teach Monai what repeats. Future bills will appear in the
                next-two-weeks view.
              </p>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <CirclePlusIcon size={16} />
                Add recurring
              </button>
            </div>
          )}
        </div>
      </section>

      <aside className="hidden w-[420px] shrink-0 border-l border-divider/60 bg-content1 xl:flex xl:items-center xl:justify-center">
        <div className="text-center text-sm text-default-400">
          <CalendarClockIcon className="mx-auto mb-3 text-default-300" size={36} />
          Select to view details
        </div>
      </aside>

      {isAdding ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close new recurring"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsAdding(false)}
          />
          <section className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-divider bg-background shadow-2xl">
            <header className="flex items-center justify-between border-b border-divider px-5 py-4">
              <h2 className="text-base font-bold">New recurring</h2>
              <button
                type="button"
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-default-400 hover:bg-content2"
                onClick={() => setIsAdding(false)}
              >
                <XIcon size={16} />
              </button>
            </header>
            <div className="p-5">
              <label className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-divider bg-content1 px-3">
                <SearchIcon size={16} className="text-default-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-default-400"
                />
              </label>
              <div className="max-h-[420px] overflow-y-auto">
                {candidates.map((transaction) => (
                  <button
                    key={transaction.id}
                    type="button"
                    className="grid w-full cursor-pointer grid-cols-[4rem_minmax(0,1fr)_4.25rem_6rem] items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-content2"
                  >
                    <span className="text-sm text-default-400">
                      {new Date(transaction.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {transaction.merchantName}
                    </span>
                    {transaction.transactionType === "regular" ? (
                      <span className="text-center text-base">
                        {transaction.category?.icon ?? "🏷️"}
                      </span>
                    ) : (
                      <span className="justify-self-center rounded-full bg-default-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-default-600">
                        {transactionTypeLabel(transaction.transactionType)}
                      </span>
                    )}
                    <span className="text-right text-sm font-bold">
                      {formatCurrency(Math.abs(transaction.amount))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

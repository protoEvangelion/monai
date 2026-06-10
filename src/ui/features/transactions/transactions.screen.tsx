import { getCategoriesWithSpending } from '../../../server/categories.fns'
import { getTransactions } from '../../../server/transactions.fns'
import { ReviewTable } from '../../shared/ReviewTable'

type TransactionsData = Awaited<ReturnType<typeof getTransactions>>
type CategoriesData = Awaited<ReturnType<typeof getCategoriesWithSpending>>

export function TransactionsScreen({
  transactions,
  categories,
}: {
  transactions: TransactionsData
  categories: CategoriesData
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-divider/60 bg-background/70 shadow-sm">
      <div className="flex h-14 items-center border-b border-divider/60 bg-background/90 px-6 backdrop-blur-xl">
        <h1 className="text-lg font-bold">Transactions</h1>
      </div>

      <ReviewTable transactions={transactions} categories={categories} showAll />
    </div>
  )
}

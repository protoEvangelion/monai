import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip as ChartTooltip,
} from 'recharts';
import { CheckCircle2Icon, ChevronRightIcon } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { getCategoriesWithSpending } from '../server/categories';
import { getTransactions } from '../server/transactions';
import { getAccounts, getNetWorthHistory } from '../server/accounts';
import { getMonthlyBudgets } from '../server/budget';
import { useTimeTravel } from '../store/useTimeTravel'
import { ReviewTable } from '../components/ReviewTable';
import { useMemo } from 'react'

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth()
  if (!isAuthenticated) throw redirect({ to: '/sign-in/$' })
})

export const Route = createFileRoute('/')({
  component: Dashboard,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [categories, transactions, accounts, netWorthHistory, budgets] = await Promise.all([
      getCategoriesWithSpending(),
      getTransactions(),
      getAccounts(),
      getNetWorthHistory(),
      getMonthlyBudgets(),
    ])
    return { categories, transactions, accounts, netWorthHistory, budgets }
  },
})

const COLORS = ['#17c964', '#006FEE', '#9333ea', '#f5a524', '#f31260']
const chartDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

type CategoriesData = Awaited<ReturnType<typeof getCategoriesWithSpending>>
type TransactionsData = Awaited<ReturnType<typeof getTransactions>>
type AccountsData = Awaited<ReturnType<typeof getAccounts>>
type NetWorthData = Awaited<ReturnType<typeof getNetWorthHistory>>
type MonthlyBudgetsData = Awaited<ReturnType<typeof getMonthlyBudgets>>

function getMonthKey(value: Date | string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function centsToDollars(cents: number) {
  return cents / 100
}

function useDashboardMetrics({
  categories,
  transactions,
  accounts,
  netWorthHistory,
  budgets,
  viewDate,
}: {
  categories: CategoriesData
  transactions: TransactionsData
  accounts: AccountsData
  netWorthHistory: NetWorthData
  budgets: MonthlyBudgetsData
  viewDate: string
}) {
  return useMemo(() => {
    const viewMonth = new Date(viewDate)
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const today = new Date()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const monthTxns = transactions.filter(tx => {
      const d = new Date(tx.date)
      return d.getFullYear() === year && d.getMonth() === month
    })

    const monthKey = getMonthKey(viewDate)
    const monthlyBudget = budgets.find((budget) => budget.month === monthKey)
    const allocationByCategoryId = new Map(
      (monthlyBudget?.allocations ?? []).map((allocation) => [
        allocation.categoryId,
        centsToDollars(allocation.amountCents),
      ])
    )
    const incomeCategoryIds = new Set<number>()
    categories
      .filter((group) => group.name.toLowerCase() === 'income')
      .forEach((group) => group.children.forEach((child) => incomeCategoryIds.add(child.id)))

    const expenseGroups = categories.filter((group) => group.name.toLowerCase() !== 'income')
    const totalBudgeted = expenseGroups.reduce(
      (sum, g) => sum + g.children.reduce((s, c) => s + (allocationByCategoryId.get(c.id) ?? c.budgetAmount), 0), 0
    )
    const budgetableMonthTxns = monthTxns.filter(tx => !tx.isInternalTransfer)

    const totalSpent = budgetableMonthTxns
      .filter(t => t.amount > 0 && (!t.categoryId || !incomeCategoryIds.has(t.categoryId)))
      .reduce((s, t) => s + t.amount, 0)
    const totalLeft = totalBudgeted - totalSpent
    const expectedIncome = centsToDollars(monthlyBudget?.expectedIncomeCents ?? 0)
    const remainingToAssignCents = (monthlyBudget?.expectedIncomeCents ?? 0) - Math.round(totalBudgeted * 100)
    const actualIncome = budgetableMonthTxns
      .filter(tx => tx.amount < 0 || (tx.categoryId && incomeCategoryIds.has(tx.categoryId)))
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
    const lastDay = isCurrentMonth ? today.getDate() : daysInMonth

    const totalAssets = accounts
      .filter(a => ['cash', 'investment'].includes(a.type))
      .reduce((s, a) => s + a.currentBalance, 0)
    const totalDebts = accounts
      .filter(a => ['credit', 'loan'].includes(a.type))
      .reduce((s, a) => s + Math.abs(a.currentBalance), 0)
    const netWorth = totalAssets - totalDebts

    const accountTypeById = new Map(accounts.map(account => [account.id, account.type]))
    const { dailyAssetDelta, dailyDebtDelta } = monthTxns.reduce(
      (acc, tx) => {
        const day = new Date(tx.date).getDate()
        const accountType = accountTypeById.get(tx.accountId)
        if (accountType === 'cash' || accountType === 'investment') {
          acc.dailyAssetDelta[day] = (acc.dailyAssetDelta[day] || 0) - tx.amount
        }
        if (accountType === 'credit' || accountType === 'loan') {
          acc.dailyDebtDelta[day] = (acc.dailyDebtDelta[day] || 0) + tx.amount
        }
        return acc
      },
      {
        dailyAssetDelta: {} as Record<number, number>,
        dailyDebtDelta: {} as Record<number, number>,
      }
    )

    const totalMonthAssetDelta = Object.values(dailyAssetDelta).reduce((sum, value) => sum + value, 0)
    const totalMonthDebtDelta = Object.values(dailyDebtDelta).reduce((sum, value) => sum + value, 0)

    const currentMonthNetWorthChartData = Array.from({ length: lastDay }, (_, i) => i + 1).reduce(
      (acc, day) => {
        const date = new Date(year, month, day)
        acc.runningAssets += dailyAssetDelta[day] || 0
        acc.runningDebts += dailyDebtDelta[day] || 0
        const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
        acc.points.push({
          day,
          monthKey,
          date,
          dateLabel: chartDateFormatter.format(date),
          assets: Math.round(acc.runningAssets),
          debts: Math.round(acc.runningDebts),
          netWorth: Math.round(acc.runningAssets - acc.runningDebts),
        })
        return acc
      },
      {
        runningAssets: totalAssets - totalMonthAssetDelta,
        runningDebts: totalDebts - totalMonthDebtDelta,
        points: [] as Array<{
          day: number
          monthKey: string
          date: Date
          dateLabel: string
          assets: number
          debts: number
          netWorth: number
        }>,
      }
    ).points

    const netWorthChartData = netWorthHistory.some(point => point.assets !== 0 || point.debts !== 0)
      ? netWorthHistory
      : currentMonthNetWorthChartData

    const { catSpend, catCount } = budgetableMonthTxns.reduce(
      (acc, tx) => {
        if (tx.category && tx.amount > 0 && !incomeCategoryIds.has(tx.category.id)) {
          acc.catSpend[tx.category.id] = (acc.catSpend[tx.category.id] || 0) + tx.amount
          acc.catCount[tx.category.id] = (acc.catCount[tx.category.id] || 0) + 1
        }
        return acc
      },
      { catSpend: {} as Record<number, number>, catCount: {} as Record<number, number> }
    )

    const topGroups = expenseGroups
      .map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        totalSpent: g.children.reduce((s, c) => s + (catSpend[c.id] || 0), 0),
        totalBudget: g.children.reduce((s, c) => s + (allocationByCategoryId.get(c.id) ?? c.budgetAmount), 0),
        txCount: g.children.reduce((s, c) => s + (catCount[c.id] || 0), 0),
      }))
      .filter(g => g.totalSpent > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5)

    return {
      totalBudgeted,
      totalSpent,
      totalLeft,
      totalAssets,
      totalDebts,
      netWorth,
      netWorthChartData,
      topGroups,
      expectedIncome,
      actualIncome,
      remainingToAssignCents,
      isZeroBasedBalanced: remainingToAssignCents === 0 && expectedIncome > 0,
      overBudget: totalBudgeted > 0 && totalLeft < 0,
    }
  }, [categories, transactions, accounts, netWorthHistory, budgets, viewDate])
}

function Dashboard() {
  const { categories, transactions, accounts, netWorthHistory, budgets } = Route.useLoaderData()
  const { viewDate } = useTimeTravel()
  const {
    totalBudgeted,
    totalSpent,
    totalLeft,
    totalAssets,
    totalDebts,
    netWorth,
    netWorthChartData,
    topGroups,
    expectedIncome,
    actualIncome,
    remainingToAssignCents,
    isZeroBasedBalanced,
    overBudget,
  } = useDashboardMetrics({
    categories,
    transactions,
    accounts,
    netWorthHistory,
    budgets,
    viewDate,
  })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

      {/* ── Left 2/3 ── */}
      <div className="xl:col-span-2 flex flex-col gap-5">

        {/* Net Worth */}
        <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-start justify-between px-6 pt-5 pb-3">
            <div>
              <div className={`text-5xl font-black leading-tight tracking-tight ${
                accounts.length === 0 ? 'text-foreground/20' : 'text-foreground'
              }`}>
                {accounts.length === 0
                  ? '—'
                  : formatCurrency(netWorth, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-default-400 text-sm mt-1">
                {accounts.length === 0
                  ? 'Connect accounts to see net worth'
                  : `${formatCurrency(totalAssets, { maximumFractionDigits: 0 })} assets · ${formatCurrency(totalDebts, { maximumFractionDigits: 0 })} debts`}
              </div>
            </div>
            <Link to="/accounts" className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors mt-1">
              Accounts <ChevronRightIcon size={14} />
            </Link>
          </div>

          <div className="h-[180px] w-full">
            {accounts.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-default-300">Connect accounts to see net worth</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={netWorthChartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <ChartTooltip
                    content={({ payload }) =>
                      payload?.length ? (
                        <div className="bg-background/90 border border-divider text-xs px-2 py-1 rounded-lg shadow-md">
                          <div className="mb-1">{payload[0].payload.dateLabel}</div>
                          <div className="text-[#17c964]">Net worth: {formatCurrency((payload.find(item => item.dataKey === 'netWorth')?.value as number) || 0)}</div>
                          <div className="text-[#006FEE]">Assets: {formatCurrency((payload.find(item => item.dataKey === 'assets')?.value as number) || 0)}</div>
                          <div className="text-[#f31260]">Debts: {formatCurrency((payload.find(item => item.dataKey === 'debts')?.value as number) || 0)}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="assets"
                    stroke="#006FEE"
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: '#006FEE' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="debts"
                    stroke="#f31260"
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: '#f31260' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#17c964"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#17c964' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Transactions to Review */}
        <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-divider/30">
            <h5 className="font-bold text-sm">Transactions to review</h5>
            <Link to="/transactions" className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors">
              View all <ChevronRightIcon size={14} />
            </Link>
          </div>
          <ReviewTable transactions={transactions} categories={categories} />
        </div>

      </div>

      {/* ── Right 1/3 ── */}
      <div className="flex flex-col gap-5">

        {/* Spending / Budget */}
        <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <h5 className="font-bold text-sm">Zero-based budget</h5>
            <Link to="/categories" className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors">
              Categories <ChevronRightIcon size={14} />
            </Link>
          </div>
          {totalBudgeted === 0 && expectedIncome === 0 ? (
            <p className="text-sm text-default-300 text-center py-6">Set expected income and allocations in Categories</p>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-2xl border px-4 py-3 ${
                isZeroBasedBalanced
                  ? 'border-success/40 bg-success/10 text-success'
                  : remainingToAssignCents < 0
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : 'border-warning/40 bg-warning/10 text-warning'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                      {isZeroBasedBalanced ? 'Ready' : remainingToAssignCents < 0 ? 'Overassigned' : 'Left to assign'}
                    </div>
                    <div className="mt-1 text-xl font-black tabular-nums">
                      {isZeroBasedBalanced
                        ? 'Every dollar is assigned'
                        : formatCurrency(Math.abs(centsToDollars(remainingToAssignCents)), { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  {isZeroBasedBalanced ? <CheckCircle2Icon size={20} /> : null}
                </div>
              </div>

              <div className="flex justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">Expected income</div>
                  <div className="text-2xl font-black text-foreground tabular-nums">
                    {formatCurrency(expectedIncome, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-default-400">
                    {formatCurrency(actualIncome, { maximumFractionDigits: 0 })} received
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">Budgeted</div>
                  <div className="text-2xl font-black text-foreground tabular-nums">
                    {formatCurrency(totalBudgeted, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-default-400 mb-2">
                  <span>Spent</span>
                  <span>{totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 999).toFixed(0) : '0'}%</span>
                </div>
                <div className="h-2 rounded-full bg-default-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${overBudget ? 'bg-danger' : 'bg-success'}`}
                    style={{ width: `${totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0}%` }}
                  />
                </div>
                <div className="text-default-400 text-xs mt-2">
                  {formatCurrency(totalSpent, { maximumFractionDigits: 0 })} of {formatCurrency(totalBudgeted, { maximumFractionDigits: 0 })} spent
                  {overBudget ? ` · ${formatCurrency(Math.abs(totalLeft), { maximumFractionDigits: 0 })} over spending plan` : ''}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Top Categories */}
        <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-divider/30">
            <h5 className="font-bold text-sm">Top categories</h5>
            <Link to="/categories" className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors">
              View all <ChevronRightIcon size={14} />
            </Link>
          </div>
          {topGroups.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-default-300">No spending this month</p>
            </div>
          ) : (
            <div className="divide-y divide-divider/20">
              {topGroups.map((cat, i) => (
                <div key={cat.id} className="px-5 py-3 hover:bg-default-50/30 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-default-300 text-xs">▶</span>
                    <span
                      className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    >
                      {cat.txCount}
                    </span>
                    <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(cat.totalSpent, { maximumFractionDigits: 0 })}</span>
                    {cat.totalBudget > 0 && (
                      <span className="text-xs text-default-400 tabular-nums w-14 text-right shrink-0">
                        {formatCurrency(cat.totalBudget, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                  {cat.totalBudget > 0 && (
                    <div className="ml-9 h-1.5 bg-default-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min((cat.totalSpent / cat.totalBudget) * 100, 100)}%`,
                          backgroundColor: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Next Two Weeks */}
        <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-bold text-sm">Next two weeks</h5>
            <span className="flex items-center gap-1 text-xs text-default-400">
              Recurrings <ChevronRightIcon size={14} />
            </span>
          </div>
          <p className="text-sm text-default-300 italic text-center py-3">There are no upcoming payments</p>
        </div>

      </div>

    </div>
  )
}

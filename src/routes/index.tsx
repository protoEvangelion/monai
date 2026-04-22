import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip as ChartTooltip,
} from 'recharts';
import { ChevronRightIcon } from 'lucide-react';
import { formatCurrency } from '../lib/format';
import { getCategoriesWithSpending } from '../server/categories';
import { getTransactions } from '../server/transactions';
import { getAccounts } from '../server/accounts';
import { useTimeTravel } from '../store/useTimeTravel'
import { ReviewTable } from '../components/ReviewTable';

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth()
  if (!isAuthenticated) throw redirect({ to: '/sign-in/$' })
})

export const Route = createFileRoute('/')({
  component: Dashboard,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [categories, transactions, accounts] = await Promise.all([
      getCategoriesWithSpending(),
      getTransactions(),
      getAccounts(),
    ])
    return { categories, transactions, accounts }
  },
})

const COLORS = ['#17c964', '#006FEE', '#9333ea', '#f5a524', '#f31260']

function Dashboard() {
  const { categories, transactions, accounts } = Route.useLoaderData()
  const { viewDate } = useTimeTravel()

  const viewMonth = new Date(viewDate)
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const today = new Date()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Filter to view month
  const monthTxns = transactions.filter(tx => {
    const d = new Date(tx.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  // Budget stats
  const totalBudgeted = categories.reduce(
    (sum, g) => sum + g.children.reduce((s, c) => s + c.budgetAmount, 0), 0
  )
  const totalSpent = monthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalLeft = totalBudgeted - totalSpent

  // Daily spending chart
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const lastDay = isCurrentMonth ? today.getDate() : daysInMonth
  const dailySpend: Record<number, number> = {}
  for (const tx of monthTxns) {
    if (tx.amount > 0) {
      const d = new Date(tx.date).getDate()
      dailySpend[d] = (dailySpend[d] || 0) + tx.amount
    }
  }
  let cum = 0
  const chartData = Array.from({ length: lastDay }, (_, i) => {
    const d = i + 1
    cum += dailySpend[d] || 0
    return { day: d, spent: Math.round(cum) }
  })

  // Assets & debts
  const totalAssets = accounts
    .filter(a => ['cash', 'investment'].includes(a.type))
    .reduce((s, a) => s + a.currentBalance, 0)
  const totalDebts = accounts
    .filter(a => ['credit', 'loan'].includes(a.type))
    .reduce((s, a) => s + a.currentBalance, 0)

  // Per-category monthly spending from transactions
  const catSpend: Record<number, number> = {}
  const catCount: Record<number, number> = {}
  for (const tx of monthTxns) {
    if (tx.category && tx.amount > 0) {
      catSpend[tx.category.id] = (catSpend[tx.category.id] || 0) + tx.amount
      catCount[tx.category.id] = (catCount[tx.category.id] || 0) + 1
    }
  }

  // Top 5 groups by monthly spending
  const topGroups = categories
    .map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      totalSpent: g.children.reduce((s, c) => s + (catSpend[c.id] || 0), 0),
      totalBudget: g.children.reduce((s, c) => s + c.budgetAmount, 0),
      txCount: g.children.reduce((s, c) => s + (catCount[c.id] || 0), 0),
    }))
    .filter(g => g.totalSpent > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5)

  const overBudget = totalBudgeted > 0 && totalLeft < 0

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

      {/* ── Left 2/3 ── */}
      <div className="xl:col-span-2 flex flex-col gap-5">

        {/* Spending / Budget */}
        <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-start justify-between px-6 pt-5 pb-3">
            <div>
              <div className={`text-5xl font-black leading-tight tracking-tight ${
                totalBudgeted === 0 ? 'text-foreground/20'
                : overBudget ? 'text-danger' : 'text-success'
              }`}>
                {totalBudgeted === 0
                  ? '—'
                  : formatCurrency(Math.abs(totalLeft), { maximumFractionDigits: 0 })}
              </div>
              <div className="text-default-400 text-sm mt-1">
                {totalBudgeted === 0
                  ? 'Set budgets in Categories to track spending'
                  : `${overBudget ? 'over budget' : 'left'} · ${formatCurrency(totalBudgeted, { maximumFractionDigits: 0 })} budgeted`}
              </div>
            </div>
            <Link to="/transactions" className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors mt-1">
              Transactions <ChevronRightIcon size={14} />
            </Link>
          </div>

          <div className="h-[180px] w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-default-300">No spending data this month</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#006FEE" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#006FEE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <ChartTooltip
                    content={({ payload }) =>
                      payload?.[0] ? (
                        <div className="bg-background/90 border border-divider text-xs px-2 py-1 rounded-lg shadow-md">
                          Day {payload[0].payload.day}: {formatCurrency(payload[0].value as number)}
                        </div>
                      ) : null
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="spent"
                    stroke="#006FEE"
                    strokeWidth={2.5}
                    fill="url(#spendGrad)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#006FEE' }}
                  />
                </AreaChart>
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

        {/* Assets & Debts */}
        <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <h5 className="font-bold text-sm">Net worth</h5>
            <Link to="/accounts" className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors">
              Accounts <ChevronRightIcon size={14} />
            </Link>
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-default-300 text-center py-6">Connect accounts to see net worth</p>
          ) : (
            <div className="flex justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">Assets</div>
                <div className="text-2xl font-black text-success tabular-nums">
                  {formatCurrency(totalAssets, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-default-400 mb-1">Debts</div>
                <div className="text-2xl font-black text-danger tabular-nums">
                  {formatCurrency(totalDebts, { maximumFractionDigits: 0 })}
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

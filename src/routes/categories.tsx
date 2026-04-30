import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  Card, CardContent, Button,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalBody,
  ModalFooter,
  Input,
} from '@heroui/react'
import {
  PlusIcon, MoreVerticalIcon, Trash2Icon, PencilIcon,
  PieChartIcon, Loader2Icon, XIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronsLeftIcon, ChevronsRightIcon, CirclePlusIcon,
  CheckCircle2Icon, AlertTriangleIcon, InfoIcon,
  TagIcon, SearchIcon, CheckIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
} from 'recharts'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../server/categories'
import {
  getMonthlyBudgets,
  updateExpectedIncome,
  updateMonthlyAllocation,
} from '../server/budget'
import {
  getTransactions,
  getTags,
  createTag,
  setTransactionsInternalTransfer,
  updateTransactionsCategory,
  setTagForTransactions,
} from '../server/transactions'
import { formatCurrency } from '../lib/format'
import { useTimeTravel } from '../store/useTimeTravel'

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth()
  if (!isAuthenticated) throw redirect({ to: '/sign-in/$' })
})

export const Route = createFileRoute('/categories')({
  component: Categories,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [groups, transactions, budgets, tags] = await Promise.all([
      getCategories(),
      getTransactions(),
      getMonthlyBudgets(),
      getTags(),
    ])
    return { groups, transactions, budgets, tags }
  },
})

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number]
type LoadedChild = LoadedGroup['children'][number]
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number]
type LoadedMonthlyBudget = Awaited<ReturnType<typeof getMonthlyBudgets>>[number]
type LoadedTag = Awaited<ReturnType<typeof getTags>>[number]

type ModalState =
  | { mode: 'create-group' }
  | { mode: 'create-child'; parentId: number; parentName: string }
  | { mode: 'edit-group'; category: LoadedGroup }
  | { mode: 'edit-child'; category: LoadedChild }

type CategoryTableRow = {
  id: string
  kind: 'group' | 'child'
  groupId: number
  childId: number | null
  name: string
  icon: string | null
  spent: number
  budget: number
  txCount: number
  childCount: number
  activeChildren: number
}

type ChartDatum = {
  day: number
  label: string
  spent: number
  budget?: number
}

function BudgetProgress({ spent, budget }: { spent: number; budget: number }) {
  const isZeroBudgetOver = budget <= 0 && spent > 0
  const rawPercent = budget > 0
    ? (spent / budget) * 100
    : spent > 0
      ? 100
      : 0
  const clampedPercent = Math.max(0, Math.min(rawPercent, 100))
  const fillClass = isZeroBudgetOver || rawPercent > 100
    ? 'bg-danger'
    : rawPercent >= 50
      ? 'bg-warning'
      : 'bg-success'

  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-default-400/60 bg-default-300/90 shadow-inner">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${fillClass}`}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  )
}

function SpendingChart({
  data,
  showBudgetLine,
}: {
  data: ChartDatum[]
  showBudgetLine: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-36 w-full rounded-2xl border border-divider/40 bg-default-50 px-3 py-2"
    >
      {size.width > 0 && size.height > 0 ? (
        <ComposedChart width={size.width} height={size.height} data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.35)" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={3} />
          <YAxis hide />
          <ChartTooltip
            formatter={(value, name) => {
              const numericValue = typeof value === 'number' ? value : Number(value ?? 0)
              return [formatCurrency(numericValue), name === 'spent' ? 'Spent' : 'Budget / day']
            }}
            labelFormatter={(label) => `Day ${label}`}
          />
          <Bar dataKey="spent" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={`spent-${entry.day}`} fill="#22c55e" />
            ))}
          </Bar>
          {showBudgetLine ? (
            <Line type="monotone" dataKey="budget" stroke="#7dd3fc" strokeWidth={2} dot={false} />
          ) : null}
        </ComposedChart>
      ) : null}
    </div>
  )
}

function useCategoryModal(refresh: () => void) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const closeModal = useCallback(() => setModal(null), [])
  const handleModalSuccess = useCallback(() => {
    setModal(null)
    refresh()
  }, [refresh])

  const handleDelete = useCallback(async (id: number, isGroup: boolean) => {
    const msg = isGroup
      ? 'Delete this group and all its categories? Transactions will be uncategorized.'
      : 'Delete this category? Transactions will be uncategorized.'
    if (!confirm(msg)) return

    setDeletingId(id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (deleteCategory as any)({ data: { id } })
      refresh()
    } finally {
      setDeletingId(null)
    }
  }, [refresh])

  return {
    modal,
    setModal,
    deletingId,
    closeModal,
    handleModalSuccess,
    handleDelete,
  }
}

function isSameMonth(dateValue: Date | string, viewDate: string) {
  const date = new Date(dateValue)
  const month = new Date(viewDate)
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth()
}

function getMonthKey(value: Date | string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function centsToDollars(cents: number) {
  return cents / 100
}

function shiftMonth(viewDate: string, delta: number) {
  const date = new Date(viewDate)
  return new Date(date.getFullYear(), date.getMonth() + delta, 1).toISOString()
}

function MonthControls({ transactions }: { transactions: { date: Date | string }[] }) {
  const { viewDate, setViewDate, resetToCurrentMonth } = useTimeTravel()
  const current = new Date(viewDate)
  const label = current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const now = new Date()
  const isCurrentMonth = current.getFullYear() === now.getFullYear() && current.getMonth() === now.getMonth()

  const earliestDate = useMemo(() => {
    if (!transactions.length) return null
    return transactions.reduce<Date | null>((min, tx) => {
      const d = new Date(tx.date)
      return !min || d < min ? d : min
    }, null)
  }, [transactions])

  const goToEarliest = () => {
    if (!earliestDate) return
    setViewDate(new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1).toISOString())
  }

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-divider/60 bg-default-50/70 px-2 py-1.5">
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Go to earliest month"
        isDisabled={!earliestDate}
        onPress={goToEarliest}
      >
        <ChevronsLeftIcon size={15} />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Previous month"
        onPress={() => setViewDate(shiftMonth(viewDate, -1))}
      >
        <ChevronLeftIcon size={16} />
      </Button>
      <div className="flex min-w-40 items-center justify-center gap-2 rounded-xl bg-background px-4 py-1.5 text-sm font-semibold text-default-700">
        <CalendarIcon size={14} className="text-default-500" />
        <span>{label}</span>
      </div>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Next month"
        onPress={() => setViewDate(shiftMonth(viewDate, 1))}
      >
        <ChevronRightIcon size={16} />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Go to current month"
        isDisabled={isCurrentMonth}
        onPress={resetToCurrentMonth}
      >
        <ChevronsRightIcon size={15} />
      </Button>
    </div>
  )
}

function CategoriesSummary({
  expectedIncome,
  actualIncome,
  totalSpent,
  totalBudget,
  remainingToAssignCents,
  incomeInput,
  savingIncome,
  onIncomeInputChange,
  onSaveIncome,
}: {
  expectedIncome: number
  actualIncome: number
  totalSpent: number
  totalBudget: number
  remainingToAssignCents: number
  incomeInput: string
  savingIncome: boolean
  onIncomeInputChange: (value: string) => void
  onSaveIncome: () => void
}) {
  const isBalanced = remainingToAssignCents === 0 && expectedIncome > 0
  const isOverAssigned = remainingToAssignCents < 0
  const remainingToAssign = centsToDollars(Math.abs(remainingToAssignCents))
  const incomeChanged = Math.max(0, Number(incomeInput) || 0) !== expectedIncome
  const assignedPercent = expectedIncome > 0
    ? Math.min((totalBudget / expectedIncome) * 100, 100)
    : totalBudget > 0
      ? 100
      : 0
  const remainingPercent = expectedIncome > 0 && !isOverAssigned
    ? Math.max(0, 100 - assignedPercent)
    : 0
  const overPercent = expectedIncome > 0 && isOverAssigned
    ? Math.min((remainingToAssign / expectedIncome) * 100, 100)
    : totalBudget > 0 && isOverAssigned
      ? 100
      : 0
  const realityBalance = actualIncome - totalSpent
  const realityVariance = Math.abs(realityBalance)
  const isRealityDeficit = realityBalance < 0
  const spentPercent = actualIncome > 0
    ? Math.min((totalSpent / actualIncome) * 100, 100)
    : totalSpent > 0
      ? 100
      : 0
  const surplusPercent = actualIncome > 0 && !isRealityDeficit
    ? Math.max(0, 100 - spentPercent)
    : 0
  const deficitPercent = actualIncome > 0 && isRealityDeficit
    ? Math.min((realityVariance / actualIncome) * 100, 100)
    : totalSpent > 0 && isRealityDeficit
      ? 100
      : 0
  const statusLabel = isBalanced
    ? 'Balanced'
    : isOverAssigned
      ? `${formatCurrency(remainingToAssign, { maximumFractionDigits: 0 })} overassigned`
      : `${formatCurrency(remainingToAssign, { maximumFractionDigits: 0 })} left to assign`
  const statusDetail = isBalanced
    ? 'Every dollar assigned'
    : isOverAssigned
      ? 'Reduce allocations'
      : 'Assign remaining income'

  return (
    <Card className="overflow-hidden border border-divider/60 bg-content1 shadow-none">
      <CardContent className="p-0">
        <div className={`relative border-l-4 ${
          isBalanced ? 'border-l-success' : isOverAssigned ? 'border-l-danger' : 'border-l-warning'
        }`}>
          <Dropdown>
            <DropdownTrigger
              aria-label="About zero-based budgeting"
              className="absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-divider/50 bg-background/85 text-default-500 shadow-sm transition-colors hover:border-primary/50 hover:text-primary"
            >
              <InfoIcon size={16} />
            </DropdownTrigger>
            <DropdownPopover className="w-80 border border-divider/60 p-0 shadow-xl">
              <div className="p-4">
                <p className="text-sm font-bold text-foreground">Why zero-based budgeting?</p>
                <p className="mt-2 text-sm leading-5 text-default-500">
                  This view helps you give every expected income dollar a job before the month happens, so the plan is intentional instead of reactive.
                </p>
                <div className="mt-3 grid gap-2 text-sm text-default-600">
                  <div className="flex gap-2">
                    <CheckCircle2Icon size={15} className="mt-0.5 shrink-0 text-success" />
                    <span>See immediately whether income is fully assigned.</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2Icon size={15} className="mt-0.5 shrink-0 text-success" />
                    <span>Catch overbudgeting before spending begins.</span>
                  </div>
                  <div className="flex gap-2">
                    <CheckCircle2Icon size={15} className="mt-0.5 shrink-0 text-success" />
                    <span>Separate the monthly plan from actual spending.</span>
                  </div>
                </div>
              </div>
            </DropdownPopover>
          </Dropdown>

          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-center">
            <div className="flex min-w-0 items-center gap-3 lg:w-64">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                isBalanced ? 'bg-success/15 text-success' : isOverAssigned ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'
              }`}>
                {isBalanced ? <CheckCircle2Icon size={22} /> : <AlertTriangleIcon size={22} />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-default-500">Zero-Based Budget</p>
                <p className={`truncate text-xl font-black leading-tight ${
                  isBalanced ? 'text-success' : isOverAssigned ? 'text-danger' : 'text-warning'
                }`}>
                  {statusLabel}
                </p>
                <p className="truncate text-xs text-default-500">{statusDetail}</p>
              </div>
            </div>

            <div className="min-w-0 w-full">
              <div className="grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_20rem] md:items-center">
                <div className="grid min-w-0 gap-4 md:max-w-2xl md:flex-1 xl:max-w-3xl">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">Plan</p>
                      <div className="flex items-center gap-3 text-xs font-semibold text-default-500">
                        <span>{formatCurrency(totalBudget, { maximumFractionDigits: 0 })} budgeted</span>
                        <span className={isBalanced ? 'text-success' : isOverAssigned ? 'text-danger' : 'text-warning'}>
                          {isOverAssigned ? '+' : ''}{formatCurrency(remainingToAssign, { maximumFractionDigits: 0 })} {isOverAssigned ? 'over' : 'remaining'}
                        </span>
                      </div>
                    </div>
                    <div className="h-4 overflow-hidden rounded-full border border-divider/40 bg-default-100 shadow-inner">
                      <div className="flex h-full w-full">
                        <div
                          className="h-full bg-success"
                          style={{ width: `${assignedPercent}%` }}
                        />
                        {remainingPercent > 0 ? (
                          <div
                            className="h-full bg-warning/35"
                            style={{ width: `${remainingPercent}%` }}
                          />
                        ) : null}
                      </div>
                    </div>
                    {overPercent > 0 ? (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-danger/10">
                        <div className="h-full rounded-full bg-danger" style={{ width: `${overPercent}%` }} />
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-default-400">
                      <span>Expected {formatCurrency(expectedIncome, { maximumFractionDigits: 0 })}</span>
                      <span>Budgeted {formatCurrency(totalBudget, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">Reality</p>
                      <div className="flex items-center gap-3 text-xs font-semibold text-default-500">
                        <span>{formatCurrency(totalSpent, { maximumFractionDigits: 0 })} spent</span>
                        <span className={isRealityDeficit ? 'text-danger' : 'text-success'}>
                          {formatCurrency(realityVariance, { maximumFractionDigits: 0 })} {isRealityDeficit ? 'deficit' : 'surplus'}
                        </span>
                      </div>
                    </div>
                    <div className="h-4 overflow-hidden rounded-full border border-divider/40 bg-default-100 shadow-inner">
                      <div className="flex h-full w-full">
                        <div
                          className={isRealityDeficit ? 'h-full bg-danger' : 'h-full bg-[#0ea5e9]'}
                          style={{ width: `${spentPercent}%` }}
                        />
                        {surplusPercent > 0 ? (
                          <div
                            className="h-full bg-success/25"
                            style={{ width: `${surplusPercent}%` }}
                          />
                        ) : null}
                      </div>
                    </div>
                    {deficitPercent > 0 ? (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-danger/10">
                        <div className="h-full rounded-full bg-danger" style={{ width: `${deficitPercent}%` }} />
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-default-400">
                      <span>Received {formatCurrency(actualIncome, { maximumFractionDigits: 0 })}</span>
                      <span>Spent {formatCurrency(totalSpent, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-accent)_12%,transparent)]">
                  <label className="min-w-0 flex-1 cursor-text">
                    <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-default-500">
                      <PencilIcon size={10} />
                      Edit income
                    </span>
                    <span className="flex items-center gap-2 rounded-lg border border-divider/60 bg-background px-2.5 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                      <span className="text-base font-black text-default-400">$</span>
                      <input
                        aria-label="Expected monthly income"
                        inputMode="decimal"
                        value={incomeInput}
                        onChange={(event) => onIncomeInputChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                            onSaveIncome()
                          }
                        }}
                        className="min-w-0 flex-1 bg-transparent text-lg font-black tracking-tight text-foreground outline-none"
                        placeholder="0"
                      />
                    </span>
                    {incomeChanged ? (
                      <span className="mt-1 block text-[10px] font-semibold text-primary">Unsaved change</span>
                    ) : null}
                  </label>
                  {incomeChanged ? (
                    <Button
                      size="sm"
                      variant="primary"
                      className="shrink-0 rounded-lg px-3"
                      onPress={onSaveIncome}
                      isDisabled={savingIncome}
                    >
                      {savingIncome ? <Loader2Icon size={14} className="animate-spin" /> : null}
                      Save
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MonthlyBudgetInput({
  categoryId,
  month,
  value,
  onSaved,
}: {
  categoryId: number
  month: string
  value: number
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(String(value || ''))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(String(value || ''))
  }, [value])

  const save = async () => {
    const amount = Math.max(0, Number(draft) || 0)
    if (amount === value) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (updateMonthlyAllocation as any)({ data: { month, categoryId, amount } })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
      <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">Budgeted</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs font-bold text-default-400">$</span>
        <input
          aria-label="Monthly budget"
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
              save()
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"
          placeholder="0"
        />
        {saving ? <Loader2Icon size={14} className="animate-spin text-default-400" /> : null}
      </div>
    </div>
  )
}

const TAG_COLORS = [
  '#ff1f2d', '#ff5b0a', '#fb8500', '#c97909',
  '#bf8500', '#f6c500', '#8a9900', '#09a10f',
  '#12b3b0', '#2d8bed', '#5b4ff5', '#a735f4',
  '#d31fe9', '#f51bb8', '#f50f5d', '#6680b3',
]

function StyledCheckbox({
  checked,
  onChange,
  onClick,
  ariaLabel,
}: {
  checked: boolean
  onChange: () => void
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void
  ariaLabel: string
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border border-default-300 bg-content2 accent-primary"
    />
  )
}

function getTransactionTags(tx: LoadedTransaction): LoadedTag[] {
  return (tx.tags ?? [])
    .map((entry) => entry.tag)
    .filter((tag): tag is LoadedTag => Boolean(tag))
}

function CategoryActionPicker({
  categories,
  selectedCategoryId,
  onChange,
  ariaLabel,
}: {
  categories: LoadedGroup[]
  selectedCategoryId: number | null
  onChange: (categoryId: number | null) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const groups = categories
    .filter((group) => group.name.toLowerCase() !== 'income')
    .map((group) => ({
      ...group,
      children: group.children.filter((child) =>
        !query ||
        child.name.toLowerCase().includes(query) ||
        group.name.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.children.length > 0)

  return (
    <Popover
      isOpen={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setSearch('')
      }}
    >
      <PopoverTrigger>
        <button
          type="button"
          aria-label={ariaLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-divider/50 bg-background text-default-600 transition-colors hover:border-primary/40 hover:text-primary"
          onClick={(event) => event.stopPropagation()}
        >
          <PieChartIcon size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 overflow-hidden rounded-2xl border border-divider bg-content1 p-0 shadow-xl">
        <div className="flex max-h-[min(30rem,calc(100vh-4rem))] min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
            <SearchIcon size={16} className="text-default-400" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-default-400"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {groups.map((group) => (
              <div key={group.id} className="px-1.5 pb-1.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-default-400">
                  {group.icon} {group.name}
                </div>
                {group.children.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      onChange(category.id)
                      setOpen(false)
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm transition-all ${
                      selectedCategoryId === category.id
                        ? 'border-success/50 bg-success/10 text-success'
                        : 'border-transparent text-default-700 hover:border-divider hover:bg-content2 hover:text-foreground'
                    }`}
                  >
                    <span className="text-base leading-none">{category.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{category.name}</span>
                    {selectedCategoryId === category.id ? <CheckIcon size={13} className="shrink-0" /> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-divider px-1.5 py-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-default-700 transition-all hover:border-divider hover:bg-content2 hover:text-foreground"
            >
              <XIcon size={14} className="shrink-0" />
              <span>Uncategorized</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TagActionPicker({
  tags,
  targetTransactions,
  onRefresh,
}: {
  tags: LoadedTag[]
  targetTransactions: LoadedTransaction[]
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[11])
  const [saving, setSaving] = useState(false)
  const transactionIds = targetTransactions.map((tx) => tx.id)
  const query = search.trim().toLowerCase()
  const filteredTags = tags.filter((tag) => !query || tag.name.toLowerCase().includes(query))

  const tagIsSelectedForAll = useCallback((tagId: number) => {
    return targetTransactions.length > 0 && targetTransactions.every((tx) =>
      getTransactionTags(tx).some((tag) => tag.id === tagId)
    )
  }, [targetTransactions])

  const toggleTag = async (tag: LoadedTag) => {
    if (!transactionIds.length) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (setTagForTransactions as any)({
        data: {
          transactionIds,
          tagId: tag.id,
          selected: !tagIsSelectedForAll(tag.id),
        },
      })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    if (!newTagName.trim() || !transactionIds.length) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (createTag as any)({ data: { name: newTagName, color: newTagColor } })
      if (created?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (setTagForTransactions as any)({
          data: { transactionIds, tagId: created.id, selected: true },
        })
      }
      setNewTagName('')
      setNewTagColor(TAG_COLORS[11])
      setCreating(false)
      setOpen(false)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Popover
        isOpen={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setSearch('')
        }}
      >
        <PopoverTrigger>
          <button
            type="button"
            aria-label="Manage tags"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-divider/50 bg-background text-default-600 transition-colors hover:border-primary/40 hover:text-primary"
            onClick={(event) => event.stopPropagation()}
          >
            <TagIcon size={15} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 overflow-hidden rounded-2xl border border-divider bg-content1 p-0 shadow-xl">
          <div className="flex max-h-[min(28rem,calc(100vh-4rem))] min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <SearchIcon size={17} className="text-default-400" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-default-400"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {filteredTags.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-default-400">No tags yet</div>
              ) : (
                filteredTags.map((tag) => {
                  const checked = tagIsSelectedForAll(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-default-100"
                    >
                      <StyledCheckbox
                        checked={checked}
                        onChange={() => toggleTag(tag)}
                        onClick={(event) => event.stopPropagation()}
                        ariaLabel={`Toggle tag ${tag.name}`}
                      />
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{tag.name}</span>
                      <MoreVerticalIcon size={14} className="text-default-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )
                })
              )}
            </div>
            <div className="border-t border-divider px-3 py-3">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-default-100"
              >
                <PlusIcon size={17} className="text-default-500" />
                <span>New tag</span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Modal
        isOpen={creating}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !saving) setCreating(false)
        }}
      >
        <ModalBackdrop variant="opaque" className="bg-black/45">
          <ModalContainer placement="top" className="pt-10 sm:pt-16">
            <ModalDialog className="w-full max-w-xl overflow-hidden rounded-2xl border border-divider bg-background p-0 shadow-2xl">
              <div className="border-b border-divider px-7 py-5">
                <p className="text-xl font-bold text-foreground">Create a new tag</p>
              </div>
              <ModalBody className="px-7 py-6">
                <label className="block">
                  <span className="mb-2 block text-base font-bold text-foreground">Name</span>
                  <Input
                    autoFocus
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="Tag name"
                    aria-label="Tag name"
                  />
                </label>
                <div className="mt-5">
                  <p className="mb-3 text-base font-bold text-foreground">Color</p>
                  <div className="grid grid-cols-8 gap-3">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Select color ${color}`}
                        onClick={() => setNewTagColor(color)}
                        className="flex aspect-square min-h-12 items-center justify-center rounded-xl"
                        style={{ backgroundColor: color }}
                      >
                        {newTagColor === color ? <CheckIcon size={22} className="text-white" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter className="justify-end border-t border-divider px-7 py-5">
                <Button
                  variant="primary"
                  onPress={handleCreate}
                  isDisabled={saving || !newTagName.trim()}
                >
                  {saving ? <Loader2Icon size={14} className="animate-spin" /> : null}
                  Create
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  )
}

function TransactionActionTable({
  transactions,
  categories,
  tags,
  onRefresh,
}: {
  transactions: LoadedTransaction[]
  categories: LoadedGroup[]
  tags: LoadedTag[]
  onRefresh: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(transactions.map((tx) => tx.id))
      const next = new Set<number>()
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id)
      })
      return next
    })
  }, [transactions])

  const selectedTransactions = useMemo(
    () => transactions.filter((tx) => selectedIds.has(tx.id)),
    [selectedIds, transactions]
  )
  const allSelected = transactions.length > 0 && transactions.every((tx) => selectedIds.has(tx.id))
  const allSelectedAreInternal = selectedTransactions.length > 0 && selectedTransactions.every((tx) => tx.isInternalTransfer)

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setInternalTransfer = async (ids: number[], isInternalTransfer: boolean) => {
    if (!ids.length) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (setTransactionsInternalTransfer as any)({ data: { ids, isInternalTransfer } })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const setCategory = async (ids: number[], categoryId: number | null) => {
    if (!ids.length) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (updateTransactionsCategory as any)({ data: { ids, categoryId } })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const grouped = transactions.reduce((acc, tx) => {
    const date = new Date(tx.date)
    const key = date.toISOString().slice(0, 10)
    const label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const existing = acc.find((group) => group.key === key)
    if (existing) existing.transactions.push(tx)
    else acc.push({ key, label, transactions: [tx] })
    return acc
  }, [] as Array<{ key: string; label: string; transactions: LoadedTransaction[] }>)

  if (transactions.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm italic text-default-400">
        No transactions for this view
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="border-b border-divider/30 px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">
            Transactions
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-default-500 transition-colors hover:text-primary"
            onClick={() => {
              setSelectedIds(allSelected ? new Set() : new Set(transactions.map((tx) => tx.id)))
            }}
          >
            {allSelected ? 'Clear' : 'Select all'}
          </button>
        </div>
      </div>

      <div className="divide-y divide-divider/20">
        {grouped.map((group) => (
          <div key={group.key}>
            <div className="bg-default-50/70 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-default-400">
              {group.label}
            </div>
            {group.transactions.map((tx) => {
              const checked = selectedIds.has(tx.id)
              const txTags = getTransactionTags(tx)
              return (
                <div
                  key={tx.id}
                  className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors ${
                    checked ? 'bg-primary/10' : 'hover:bg-default-50'
                  }`}
                >
                  <StyledCheckbox
                    checked={checked}
                    onChange={() => toggleOne(tx.id)}
                    ariaLabel={`Select transaction ${tx.merchantName}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{tx.merchantName}</p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-default-400">
                      {tx.account?.name ? <span className="truncate">{tx.account.name}</span> : null}
                      {tx.isInternalTransfer ? <span className="rounded-full bg-warning/15 px-1.5 py-0.5 font-semibold text-warning">Transfer</span> : null}
                      {txTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 rounded-full bg-default-100 px-1.5 py-0.5 text-[11px] font-medium text-default-600"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CategoryActionPicker
                      categories={categories}
                      selectedCategoryId={tx.categoryId}
                      ariaLabel={`Change category for ${tx.merchantName}`}
                      onChange={(categoryId) => setCategory([tx.id], categoryId)}
                    />
                    <button
                      type="button"
                      aria-label={tx.isInternalTransfer ? 'Unmark internal transfer' : 'Mark internal transfer'}
                      onClick={() => setInternalTransfer([tx.id], !tx.isInternalTransfer)}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-black transition-colors ${
                        tx.isInternalTransfer
                          ? 'border-warning/50 bg-warning/15 text-warning'
                          : 'border-divider/50 bg-background text-default-600 hover:border-primary/40 hover:text-primary'
                      }`}
                    >
                      T
                    </button>
                    <TagActionPicker tags={tags} targetTransactions={[tx]} onRefresh={onRefresh} />
                    <span className={`ml-1 w-20 shrink-0 text-right text-sm font-bold tabular-nums ${tx.amount < 0 ? 'text-success' : 'text-foreground'}`}>
                      {formatCurrency(tx.amount, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {selectedTransactions.length > 0 ? (
        <div className="sticky bottom-3 z-10 mx-5 mb-3 mt-4 flex w-[calc(100%-2.5rem)] items-center gap-2 rounded-2xl border border-divider bg-content1/95 p-2 shadow-xl backdrop-blur">
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => setSelectedIds(new Set())}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-divider/50 bg-background text-foreground transition-colors hover:text-danger"
          >
            <XIcon size={16} />
          </button>
          <span className="min-w-0 flex-1 whitespace-nowrap text-sm font-bold text-foreground">
            {selectedTransactions.length} selected
          </span>
          {saving ? <Loader2Icon size={16} className="animate-spin text-default-400" /> : null}
          <CategoryActionPicker
            categories={categories}
            selectedCategoryId={selectedTransactions[0]?.categoryId ?? null}
            ariaLabel="Change selected categories"
            onChange={(categoryId) => setCategory(selectedTransactions.map((tx) => tx.id), categoryId)}
          />
          <button
            type="button"
            aria-label={allSelectedAreInternal ? 'Unmark selected internal transfers' : 'Mark selected internal transfers'}
            onClick={() => setInternalTransfer(selectedTransactions.map((tx) => tx.id), !allSelectedAreInternal)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-black transition-colors ${
              allSelectedAreInternal
                ? 'border-warning/50 bg-warning/15 text-warning'
                : 'border-divider/50 bg-background text-default-600 hover:border-primary/40 hover:text-primary'
            }`}
          >
            T
          </button>
          <TagActionPicker tags={tags} targetTransactions={selectedTransactions} onRefresh={onRefresh} />
          <Dropdown>
            <DropdownTrigger
              aria-label="Bulk transaction actions"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-divider/50 bg-background text-default-600 transition-colors hover:border-primary/40 hover:text-primary"
            >
              <MoreVerticalIcon size={16} />
            </DropdownTrigger>
            <DropdownPopover>
              <DropdownMenu aria-label="Bulk transaction actions">
                <DropdownItem key="select-all" onAction={() => setSelectedIds(new Set(transactions.map((tx) => tx.id)))}>
                  Select all
                </DropdownItem>
                <DropdownItem key="clear" onAction={() => setSelectedIds(new Set())}>
                  Unselect all
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        </div>
      ) : null}
    </div>
  )
}

function Categories() {
  const router = useRouter()
  const { groups, transactions, budgets, tags } = Route.useLoaderData()
  const { viewDate } = useTimeTravel()
  const refresh = useCallback(() => router.invalidate(), [router])
  const { modal, setModal, deletingId, closeModal, handleModalSuccess, handleDelete } = useCategoryModal(refresh)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(groups[0]?.id ?? null)
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(() => new Set())
  const [detailOpen, setDetailOpen] = useState(false)
  const [incomeInput, setIncomeInput] = useState('')
  const [savingIncome, setSavingIncome] = useState(false)

  const monthKey = useMemo(() => getMonthKey(viewDate), [viewDate])
  const monthlyBudget = useMemo<LoadedMonthlyBudget | null>(
    () => budgets.find((budget) => budget.month === monthKey) ?? null,
    [budgets, monthKey]
  )
  const allocationByCategoryId = useMemo(() => {
    return new Map(
      (monthlyBudget?.allocations ?? []).map((allocation) => [
        allocation.categoryId,
        centsToDollars(allocation.amountCents),
      ])
    )
  }, [monthlyBudget])
  const expectedIncome = centsToDollars(monthlyBudget?.expectedIncomeCents ?? 0)

  useEffect(() => {
    setIncomeInput(expectedIncome ? String(expectedIncome) : '')
  }, [expectedIncome, monthKey])

  const saveExpectedIncome = useCallback(async () => {
    const expectedIncomeValue = Math.max(0, Number(incomeInput) || 0)
    if (expectedIncomeValue === expectedIncome) return
    setSavingIncome(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (updateExpectedIncome as any)({ data: { month: viewDate, expectedIncome: expectedIncomeValue } })
      refresh()
    } finally {
      setSavingIncome(false)
    }
  }, [expectedIncome, incomeInput, refresh, viewDate])

  const monthAllTransactions = useMemo(
    () => transactions.filter(tx => isSameMonth(tx.date, viewDate)),
    [transactions, viewDate]
  )
  const budgetedMonthTransactions = useMemo(
    () => monthAllTransactions.filter(tx => !tx.isInternalTransfer),
    [monthAllTransactions]
  )
  const incomeCategoryIds = useMemo(() => {
    const ids = new Set<number>()
    groups
      .filter((group) => group.name.toLowerCase() === 'income')
      .forEach((group) => group.children.forEach((child) => ids.add(child.id)))
    return ids
  }, [groups])
  const monthTransactions = useMemo(
    () => budgetedMonthTransactions.filter(tx => tx.amount > 0 && (!tx.categoryId || !incomeCategoryIds.has(tx.categoryId))),
    [budgetedMonthTransactions, incomeCategoryIds]
  )
  const monthDetailTransactions = useMemo(
    () => monthAllTransactions.filter(tx => tx.amount > 0 && (!tx.categoryId || !incomeCategoryIds.has(tx.categoryId))),
    [incomeCategoryIds, monthAllTransactions]
  )
  const actualIncome = useMemo(
    () => budgetedMonthTransactions
      .filter(tx => tx.amount < 0 || (tx.categoryId && incomeCategoryIds.has(tx.categoryId)))
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    [budgetedMonthTransactions, incomeCategoryIds]
  )

  const categoryMetrics = useMemo(() => {
    return monthTransactions.reduce((map, tx) => {
      if (!tx.categoryId) return map
      const current = map.get(tx.categoryId) ?? { spent: 0, txCount: 0, transactions: [] as LoadedTransaction[] }
      current.spent += tx.amount
      current.txCount += 1
      current.transactions.push(tx)
      map.set(tx.categoryId, current)
      return map
    }, new Map<number, { spent: number; txCount: number; transactions: LoadedTransaction[] }>())
  }, [monthTransactions])

  const derivedGroups = useMemo(() => {
    return groups.map(group => {
      const children = group.children
        .map(child => {
          const metrics = categoryMetrics.get(child.id)
          const allocationAmount = allocationByCategoryId.get(child.id) ?? child.budgetAmount
          return {
            ...child,
            allocationAmount,
            spent: metrics?.spent ?? 0,
            txCount: metrics?.txCount ?? 0,
            transactions: metrics?.transactions ?? [],
          }
        })
        .sort((a, b) => {
          if (b.spent !== a.spent) return b.spent - a.spent
          return a.name.localeCompare(b.name)
        })

      const spent = children.reduce((sum, child) => sum + child.spent, 0)
      const budget = children.reduce((sum, child) => sum + child.allocationAmount, 0)
      const txCount = children.reduce((sum, child) => sum + child.txCount, 0)

      return {
        ...group,
        children,
        spent,
        budget,
        txCount,
        activeChildren: children.filter(child => child.spent > 0).length,
      }
    })
  }, [allocationByCategoryId, categoryMetrics, groups])

  const totals = useMemo(() => {
    const expenseGroups = derivedGroups.filter((group) => group.name.toLowerCase() !== 'income')
    const totalSpent = expenseGroups.reduce((sum, group) => sum + group.spent, 0)
    const totalBudget = expenseGroups.reduce((sum, group) => sum + group.budget, 0)
    const totalBudgetCents = Math.round(totalBudget * 100)
    const totalCategories = expenseGroups.reduce((sum, group) => sum + group.children.length, 0)
    const activeCategories = expenseGroups.reduce(
      (sum, group) => sum + group.children.filter(child => child.spent > 0).length,
      0
    )

    return {
      totalSpent,
      totalBudget,
      totalBudgetCents,
      totalCategories,
      activeCategories,
      remainingToAssignCents: (monthlyBudget?.expectedIncomeCents ?? 0) - totalBudgetCents,
    }
  }, [derivedGroups, monthlyBudget])

  useEffect(() => {
    if (!derivedGroups.length) {
      setSelectedGroupId(null)
      setDetailOpen(false)
      return
    }

    if (!derivedGroups.some(group => group.id === selectedGroupId)) {
      setSelectedGroupId(derivedGroups[0].id)
    }
  }, [derivedGroups, selectedGroupId])

  useEffect(() => {
    setExpandedGroupIds((prev) => {
      const validIds = new Set(derivedGroups.map((group) => group.id))
      const next = new Set<number>()

      if (prev.size === 0) {
        validIds.forEach((id) => next.add(id))
        return next
      }

      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id)
      })

      // Auto-open any newly introduced groups after refreshes.
      validIds.forEach((id) => {
        if (!prev.has(id)) next.add(id)
      })

      return next
    })
  }, [derivedGroups, selectedGroupId])

  const selectedGroup = derivedGroups.find(group => group.id === selectedGroupId) ?? derivedGroups[0] ?? null
  const selectedChild = selectedGroup?.children.find(child => child.id === selectedChildId) ?? null
  const monthLabel = new Date(viewDate).toLocaleDateString('en-US', { month: 'short' })

  const selectedGroupChartData = useMemo(() => {
    if (!selectedGroup) return []

    const monthDate = new Date(viewDate)
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const categoryIds = new Set(selectedGroup.children.map((child) => child.id))
    const dailySpent = new Map<number, number>()

    monthTransactions.forEach((tx) => {
      if (!tx.categoryId || !categoryIds.has(tx.categoryId)) return
      const day = new Date(tx.date).getDate()
      dailySpent.set(day, (dailySpent.get(day) ?? 0) + tx.amount)
    })

    return Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1
      return {
        day,
        label: String(day),
        spent: Number((dailySpent.get(day) ?? 0).toFixed(2)),
      }
    })
  }, [monthTransactions, selectedGroup, viewDate])

  useEffect(() => {
    if (!selectedGroup || selectedGroup.children.length === 0) {
      setSelectedChildId(null)
      return
    }

    if (selectedChildId !== null && !selectedGroup.children.some(child => child.id === selectedChildId)) {
      setSelectedChildId(null)
    }
  }, [selectedChildId, selectedGroup])

  const selectedChildChartData = useMemo(() => {
    if (!selectedChild) return []

    const monthDate = new Date(viewDate)
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const dailySpent = new Map<number, number>()

    selectedChild.transactions.forEach((tx) => {
      const day = new Date(tx.date).getDate()
      dailySpent.set(day, (dailySpent.get(day) ?? 0) + tx.amount)
    })

    const dailyBudget = selectedChild.allocationAmount > 0
      ? selectedChild.allocationAmount / daysInMonth
      : 0

    return Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1
      return {
        day,
        label: String(day),
        spent: Number((dailySpent.get(day) ?? 0).toFixed(2)),
        budget: Number(dailyBudget.toFixed(2)),
      }
    })
  }, [selectedChild, viewDate])

  const chartData = selectedChild ? selectedChildChartData : selectedGroupChartData

  const selectedTransactions = useMemo(() => {
    if (!selectedGroup) return []

    if (selectedChild) {
      return monthDetailTransactions
        .filter((tx) => tx.categoryId === selectedChild.id)
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }

    const groupCategoryIds = new Set(selectedGroup.children.map((child) => child.id))
    return monthDetailTransactions
      .filter((tx) => tx.categoryId && groupCategoryIds.has(tx.categoryId))
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [monthDetailTransactions, selectedChild, selectedGroup])

  const selectedRowId = selectedChildId !== null
    ? `child-${selectedChildId}`
    : selectedGroupId !== null
      ? `group-${selectedGroupId}`
      : null
  const selectedBudget = selectedChild ? selectedChild.allocationAmount : selectedGroup?.budget ?? 0
  const selectedSpent = selectedChild ? selectedChild.spent : selectedGroup?.spent ?? 0
  const selectedAvailable = selectedBudget - selectedSpent

  const tableRows = useMemo<CategoryTableRow[]>(() => {
    const rows: CategoryTableRow[] = []

    for (const group of derivedGroups) {
      rows.push({
        id: `group-${group.id}`,
        kind: 'group',
        groupId: group.id,
        childId: null,
        name: group.name,
        icon: group.icon,
        spent: group.spent,
        budget: group.budget,
        txCount: group.txCount,
        childCount: group.children.length,
        activeChildren: group.activeChildren,
      })

      if (expandedGroupIds.has(group.id)) {
        for (const child of group.children) {
          rows.push({
            id: `child-${child.id}`,
            kind: 'child',
            groupId: group.id,
            childId: child.id,
            name: child.name,
            icon: child.icon,
            spent: child.spent,
            budget: child.allocationAmount,
            txCount: child.txCount,
            childCount: 0,
            activeChildren: 0,
          })
        }
      }
    }

    return rows
  }, [derivedGroups, expandedGroupIds])

  const columnHelper = createColumnHelper<CategoryTableRow>()

  const tableColumns = useMemo(
    () => [
      columnHelper.display({
        id: 'category',
        header: () => 'Regular categories',
        cell: ({ row }) => {
          const item = row.original
          const isGroup = item.kind === 'group'
          const isActive = selectedRowId === item.id

          if (isGroup) {
            const expanded = expandedGroupIds.has(item.groupId)
            return (
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={expanded ? 'Collapse group' : 'Expand group'}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-default-400 hover:bg-default-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedGroupId(item.groupId)
                    setSelectedChildId(null)
                    setDetailOpen(true)
                    setExpandedGroupIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(item.groupId)) next.delete(item.groupId)
                      else next.add(item.groupId)
                      return next
                    })
                  }}
                >
                  <ChevronRightIcon size={14} className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'} />
                </button>
                <div className="min-w-0">
                  <p className={`truncate text-base font-semibold leading-tight ${isActive ? 'text-primary' : 'text-foreground'}`}>{item.name}</p>
                </div>
              </div>
            )
          }

          return (
            <div className="min-w-0 pl-12">
              <p className={`truncate text-sm font-semibold ${isActive ? 'text-primary' : 'text-foreground'}`}>{item.icon} {item.name}</p>
            </div>
          )
        },
      }),
      columnHelper.accessor('spent', {
        header: () => <span className="block text-right">Spent</span>,
        cell: ({ row, getValue }) => (
          <span className={`block text-right ${row.original.kind === 'group' ? 'text-base font-semibold text-foreground' : 'text-sm font-semibold text-default-700'}`}>
            {formatCurrency(getValue(), { maximumFractionDigits: 0 })}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'progress',
        header: () => <span aria-hidden="true" />,
        cell: ({ row }) => <BudgetProgress spent={row.original.spent} budget={row.original.budget} />,
      }),
      columnHelper.accessor('budget', {
        header: () => <span className="block text-left">Budgeted</span>,
        cell: ({ row, getValue }) => (
          <span className={`block text-left ${row.original.kind === 'group' ? 'text-base font-semibold text-foreground' : 'text-sm font-semibold text-foreground'}`}>
            {formatCurrency(getValue(), { maximumFractionDigits: 0 })}
          </span>
        ),
      }),
    ],
    [columnHelper, expandedGroupIds, selectedRowId]
  )

  const categoriesTable = useReactTable({
    data: tableRows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-5 pb-20">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0 justify-self-start">
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="mt-0.5 text-sm text-default-400">
            {groups.length} group{groups.length !== 1 ? 's' : ''} · {groups.reduce((s, g) => s + g.children.length, 0)} categories
          </p>
        </div>

        <div className="justify-self-center">
          <MonthControls transactions={transactions} />
        </div>

        <div className="flex items-center gap-3 justify-self-end">
          <Dropdown>
            <DropdownTrigger className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_16px_color-mix(in_oklch,var(--color-accent)_45%,transparent)] transition-all hover:brightness-95 hover:shadow-[0_0_22px_color-mix(in_oklch,var(--color-accent)_60%,transparent)] active:scale-95">
              <CirclePlusIcon size={14} />
              New
            </DropdownTrigger>
            <DropdownPopover>
              <DropdownMenu aria-label="Create actions">
                <DropdownItem key="new-group" onAction={() => setModal({ mode: 'create-group' })}>
                  <div className="flex items-center gap-2">
                    <PlusIcon size={13} />
                    <span>New Group</span>
                  </div>
                </DropdownItem>
                <DropdownItem
                  key="new-category"
                  isDisabled={!selectedGroup}
                  onAction={() => {
                    if (!selectedGroup) return
                    setModal({ mode: 'create-child', parentId: selectedGroup.id, parentName: selectedGroup.name })
                  }}
                >
                  <div className="flex items-center gap-2">
                    <PlusIcon size={13} />
                    <span>New Category</span>
                  </div>
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        </div>
      </div>

      <CategoriesSummary
        expectedIncome={expectedIncome}
        actualIncome={actualIncome}
        totalSpent={totals.totalSpent}
        totalBudget={totals.totalBudget}
        remainingToAssignCents={totals.remainingToAssignCents}
        incomeInput={incomeInput}
        savingIncome={savingIncome}
        onIncomeInputChange={setIncomeInput}
        onSaveIncome={saveExpectedIncome}
      />

      {groups.length === 0 ? (
        <Card className="w-full bg-background/60 backdrop-blur-md border-divider/50">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-default-100 flex items-center justify-center">
              <PieChartIcon size={28} className="text-default-400" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-semibold">No categories yet</p>
              <p className="text-sm text-default-400 max-w-xs">Create a group to start organizing your spending and setting budgets.</p>
            </div>
            <Button variant="primary" size="sm" onPress={() => setModal({ mode: 'create-group' })}>
              <PlusIcon size={15} /> New Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={`grid items-start gap-4 ${
          detailOpen
            ? 'md:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]'
            : 'xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]'
        }`}>
          <Card className="overflow-hidden border border-divider/60 bg-content1 shadow-none">
            <CardContent className="p-0">
              <div className="overflow-hidden">
                <table className="w-full table-fixed border-separate border-spacing-0">
                  <thead>
                    {categoriesTable.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-default-400 ${header.id === 'category' ? 'w-[36%] text-left' : header.id === 'progress' ? 'w-[36%] text-center' : 'w-[14%] text-left'}`}
                          >
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {categoriesTable.getRowModel().rows.map((row) => {
                      const item = row.original
                      const selected = selectedRowId === item.id
                      const hovered = hoveredRowId === item.id
                      const rowSurfaceClass = selected
                        ? 'bg-[color-mix(in_oklch,var(--color-accent)_12%,transparent)]'
                        : hovered
                          ? 'bg-[color-mix(in_oklch,var(--color-accent)_16%,transparent)]'
                          : ''

                      const cells = row.getVisibleCells()
                      return (
                        <tr
                          key={row.id}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredRowId(item.id)}
                          onMouseLeave={() => setHoveredRowId((prev) => (prev === item.id ? null : prev))}
                          onClick={() => {
                            if (item.kind === 'group') {
                              setSelectedGroupId(item.groupId)
                              setSelectedChildId(null)
                              setDetailOpen(true)
                            } else if (item.childId) {
                              setSelectedGroupId(item.groupId)
                              setSelectedChildId(item.childId)
                              setDetailOpen(true)
                            }
                          }}
                        >
                          {cells.map((cell, ci) => (
                            <td
                              key={cell.id}
                              className={[
                                'px-3 py-2.5 align-middle transition-[background-color,border-color,color] duration-150',
                                rowSurfaceClass,
                                cell.column.id === 'progress' ? 'text-center' : cell.column.id === 'category' ? 'text-left' : 'text-left',
                                ci === 0 ? 'rounded-l-xl' : '',
                                ci === cells.length - 1 ? 'rounded-r-xl' : '',

                              ].join(' ')}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className={[
            'overflow-hidden border border-divider/60 bg-content1 shadow-none',
            detailOpen
              ? 'block'
              : 'hidden xl:block',
          ].join(' ')}>
            <CardContent className="p-0">
              {selectedGroup ? (
                <>
                  <div className="border-b border-divider/40 px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setModal(selectedChild
                            ? { mode: 'edit-child', category: selectedChild }
                            : { mode: 'edit-group', category: selectedGroup })}
                          className="group relative flex aspect-square h-12 w-12 min-w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-divider/40 bg-default-50 text-2xl transition-colors hover:bg-default-100"
                          aria-label={selectedChild ? 'Edit category icon' : 'Edit group icon'}
                          title={selectedChild ? 'Edit category icon' : 'Edit group icon'}
                        >
                          <span>{selectedChild?.icon ?? selectedGroup.icon}</span>
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <PencilIcon size={14} className="text-white" />
                          </span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                            {selectedChild ? selectedChild.name : selectedGroup.name}
                          </h2>
                          <p className="mt-1 text-sm text-default-400">
                            {selectedChild
                              ? `${selectedGroup.name}`
                              : 'Spending this month'}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!selectedChild && selectedGroup && (
                          <Dropdown>
                            <DropdownTrigger
                              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100"
                              aria-label="Group actions"
                            >
                              {deletingId === selectedGroup.id
                                ? <Loader2Icon size={14} className="animate-spin" />
                                : <MoreVerticalIcon size={14} />}
                            </DropdownTrigger>
                            <DropdownPopover>
                              <DropdownMenu aria-label="Group actions">
                                <DropdownItem
                                  key="edit"
                                  onAction={() => setModal({ mode: 'edit-group', category: selectedGroup })}
                                >
                                  <div className="flex items-center gap-2">
                                    <PencilIcon size={13} />
                                    <span>Edit Group</span>
                                  </div>
                                </DropdownItem>
                                <DropdownItem key="delete" className="text-danger" onAction={() => handleDelete(selectedGroup.id, true)}>
                                  <div className="flex items-center gap-2">
                                    <Trash2Icon size={13} />
                                    <span>Delete Group</span>
                                  </div>
                                </DropdownItem>
                              </DropdownMenu>
                            </DropdownPopover>
                          </Dropdown>
                        )}
                        {selectedChild && (
                          <Dropdown>
                            <DropdownTrigger
                              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-default-400 transition-colors hover:bg-default-100"
                              aria-label="Category actions"
                            >
                              {deletingId === selectedChild.id
                                ? <Loader2Icon size={14} className="animate-spin" />
                                : <MoreVerticalIcon size={14} />}
                            </DropdownTrigger>
                            <DropdownPopover>
                              <DropdownMenu aria-label="Category actions">
                                <DropdownItem
                                  key="edit"
                                  onAction={() => setModal({ mode: 'edit-child', category: selectedChild })}
                                >
                                  <div className="flex items-center gap-2">
                                    <PencilIcon size={13} />
                                    <span>Edit Category</span>
                                  </div>
                                </DropdownItem>
                                <DropdownItem key="delete" className="text-danger" onAction={() => handleDelete(selectedChild.id, false)}>
                                  <div className="flex items-center gap-2">
                                    <Trash2Icon size={13} />
                                    <span>Delete Category</span>
                                  </div>
                                </DropdownItem>
                              </DropdownMenu>
                            </DropdownPopover>
                          </Dropdown>
                        )}
                        <Button
                          variant="ghost"
                          isIconOnly
                          size="sm"
                          className="rounded-lg xl:hidden"
                          aria-label="Close category details"
                          onPress={() => setDetailOpen(false)}
                        >
                          <XIcon size={15} />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">Spent</p>
                        <p className="truncate text-sm font-bold text-foreground">
                          {formatCurrency(selectedChild?.spent ?? selectedGroup.spent, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">Left</p>
                        <p className={`truncate text-sm font-bold ${selectedAvailable < 0 ? 'text-danger' : 'text-success'}`}>
                          {selectedAvailable < 0 ? '-' : ''}
                          {formatCurrency(Math.abs(selectedAvailable), { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      {selectedChild ? (
                        <MonthlyBudgetInput
                          categoryId={selectedChild.id}
                          month={viewDate}
                          value={selectedChild.allocationAmount}
                          onSaved={refresh}
                        />
                      ) : (
                        <div className="min-w-0 rounded-xl border border-divider/40 bg-default-50 px-2 py-2">
                          <p className="text-[9px] uppercase tracking-[0.12em] text-default-400">Categories</p>
                          <p className="truncate text-sm font-bold text-foreground">{selectedGroup.children.length}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-b border-divider/30 px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
                        {selectedChild ? `${selectedChild.name} in ${monthLabel}` : `Spent in ${monthLabel}`}
                      </p>
                      <p className="text-sm font-semibold text-default-600">
                        {selectedChild
                          ? `${formatCurrency(selectedChild.spent, { maximumFractionDigits: 0 })} / ${formatCurrency(selectedChild.allocationAmount, { maximumFractionDigits: 0 })}`
                          : formatCurrency(selectedGroup.spent, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <SpendingChart data={chartData} showBudgetLine={Boolean(selectedChild)} />
                  </div>

                  <TransactionActionTable
                    transactions={selectedTransactions}
                    categories={groups}
                    tags={tags}
                    onRefresh={refresh}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {modal && (
        <CategoryModal
          modal={modal}
          onClose={closeModal}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}

type CategoryModalProps = {
  modal: ModalState
  onClose: () => void
  onSuccess: () => void
}

function CategoryModal({ modal, onClose, onSuccess }: CategoryModalProps) {
  const isGroup = modal.mode === 'create-group' || modal.mode === 'edit-group'
  const isEdit = modal.mode === 'edit-group' || modal.mode === 'edit-child'

  const existing = modal.mode === 'edit-group'
    ? modal.category
    : modal.mode === 'edit-child'
    ? modal.category
    : null

  const [icon, setIcon] = useState(existing?.icon ?? '')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [openPickerAbove, setOpenPickerAbove] = useState(false)
  const iconBtnRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(existing?.name ?? '')
  const [budget, setBudget] = useState(
    existing && 'budgetAmount' in existing ? String(existing.budgetAmount || '') : ''
  )
  const [saving, setSaving] = useState(false)
  const numericBudget = Math.max(0, Number(budget) || 0)
  const sliderMax = Math.max(2000, Math.ceil(numericBudget / 500) * 500)

  useEffect(() => {
    if (!showEmojiPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        iconBtnRef.current &&
        !iconBtnRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false)
      }
    }
    // Use capture phase to intercept clicks early
    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [showEmojiPicker])

  const toggleEmojiPicker = () => {
    if (showEmojiPicker) {
      setShowEmojiPicker(false)
      return
    }

    const rect = iconBtnRef.current?.getBoundingClientRect()
    if (rect) {
      const pickerHeight = 360
      const gap = 8
      const spaceBelow = window.innerHeight - rect.bottom - gap
      const spaceAbove = rect.top - gap
      setOpenPickerAbove(spaceBelow < pickerHeight && spaceAbove > spaceBelow)
    }

    setShowEmojiPicker(true)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (isEdit && existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (updateCategory as any)({
          data: {
            id: existing.id,
            name: name.trim(),
            icon: icon.trim() || (isGroup ? '📁' : '📌'),
            budgetAmount: isGroup ? 0 : parseFloat(budget) || 0,
          },
        })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (createCategory as any)({
          data: {
            name: name.trim(),
            icon: icon.trim() || (isGroup ? '📁' : '📌'),
            budgetAmount: isGroup ? 0 : parseFloat(budget) || 0,
            parentId: modal.mode === 'create-child' ? modal.parentId : null,
          },
        })
      }
      onSuccess()
    } finally {
      setSaving(false)
    }
  }

  const title = modal.mode === 'create-group'
    ? 'New Group'
    : modal.mode === 'create-child'
    ? `New Category in ${modal.parentName}`
    : isGroup
    ? 'Edit Group'
    : 'Edit Category'

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <ModalBackdrop variant="opaque" className="bg-black/60">
        <ModalContainer placement="top" className="pt-10 sm:pt-14">
          <ModalDialog className="w-full max-w-sm rounded-2xl border border-divider/50 bg-background shadow-2xl p-0 overflow-visible">
            <div className="flex items-center justify-between px-5 py-4 border-b border-divider/50">
              <span className="font-semibold text-base">{title}</span>
              <Button
                variant="ghost"
                isIconOnly
                size="sm"
                className="rounded-lg -mr-1"
                onPress={onClose}
                isDisabled={saving}
              >
                <XIcon size={15} />
              </Button>
            </div>

          <ModalBody className="px-5 py-4 flex flex-col gap-4 overflow-visible">
            <div className="flex gap-2">
              <div className="flex flex-col gap-1">
                <label className="sr-only">Icon</label>
                <div className="relative">
                  <button
                    ref={iconBtnRef}
                    type="button"
                    onClick={toggleEmojiPicker}
                    className="group w-14 h-10 relative flex items-center justify-center rounded-xl border border-default-200 bg-default-100 hover:bg-default-200 text-2xl transition-colors cursor-pointer"
                    aria-label="Choose emoji"
                    title="Choose emoji"
                  >
                    <span>{icon || (isGroup ? '📁' : '📌')}</span>
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <PencilIcon size={14} className="text-white" />
                    </span>
                  </button>
                  {showEmojiPicker && (
                    <div
                      ref={pickerRef}
                      className={`absolute left-0 z-50 ${openPickerAbove ? 'bottom-full mb-2' : 'top-full mt-2'}`}
                    >
                      <EmojiPicker
                        theme={Theme.AUTO}
                        width={320}
                        height={340}
                        onEmojiClick={(e: EmojiClickData) => {
                          setIcon(e.emoji)
                          setShowEmojiPicker(false)
                        }}
                        lazyLoadEmojis
                        searchPlaceholder="Search emoji…"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="sr-only">Name</label>
                <Input
                  aria-label="Name"
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={isGroup ? 'e.g. Food & Dining' : 'Category name'}
                  required
                />
              </div>
            </div>

            {!isGroup && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-default-400 font-medium">Default Budget <span className="text-default-300">(optional)</span></label>
                <div className="rounded-2xl border border-divider/50 bg-default-50/70 px-3 py-3">
                  <input
                    aria-label="Monthly budget slider"
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={25}
                    value={numericBudget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="budget-slider mb-3 w-full cursor-pointer"
                  />
                  <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-default-400">
                    <span>$0</span>
                    <span className="rounded-md bg-default-100 px-2 py-0.5 text-default-600">${numericBudget.toLocaleString()}</span>
                    <span>${sliderMax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-center">
                    <input
                      aria-label="Monthly budget"
                      type="number"
                      min="0"
                      step="1"
                      value={budget}
                      onChange={e => setBudget(e.target.value)}
                      placeholder="0"
                      className="w-40 rounded-xl border border-default-200 bg-default-100 px-3 py-2 text-center text-foreground outline-none transition-colors focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}
          </ModalBody>

          <ModalFooter className="flex gap-2 px-5 py-4 border-t border-divider/50">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onPress={onClose}
              isDisabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onPress={handleSave}
              isDisabled={saving || !name.trim()}
            >
              {saving ? <Loader2Icon size={14} className="animate-spin" /> : null}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

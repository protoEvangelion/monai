import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  Card, CardContent, Button,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover,
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
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer,
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
import { getTransactions } from '../server/transactions'
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
    const [groups, transactions] = await Promise.all([
      getCategories(),
      getTransactions(),
    ])
    return { groups, transactions }
  },
})

type LoadedGroup = Awaited<ReturnType<typeof getCategories>>[number]
type LoadedChild = LoadedGroup['children'][number]
type LoadedTransaction = Awaited<ReturnType<typeof getTransactions>>[number]

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
  totalSpent,
  totalBudget,
  activeCategories,
  totalCategories,
}: {
  totalSpent: number
  totalBudget: number
  activeCategories: number
  totalCategories: number
}) {
  return (
    <Card className="border border-divider/60 bg-content1 shadow-none">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-divider/40 bg-default-50 p-4 md:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">Month Overview</p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-3xl font-black tracking-tight text-foreground">
                {formatCurrency(totalSpent, { maximumFractionDigits: 0 })}
              </span>
              <span className="pb-1 text-sm text-default-400">
                of {formatCurrency(totalBudget, { maximumFractionDigits: 0 })} budgeted
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-divider/40 bg-default-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Active Categories</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{activeCategories}</p>
          </div>
          <div className="rounded-2xl border border-divider/40 bg-default-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Total Categories</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{totalCategories}</p>
          </div>
          <div className="rounded-2xl border border-divider/40 bg-default-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Budget Coverage</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {totalBudget > 0 ? `${Math.round(Math.min((totalSpent / totalBudget) * 100, 999))}%` : '0%'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Categories() {
  const router = useRouter()
  const { groups, transactions } = Route.useLoaderData()
  const { viewDate } = useTimeTravel()
  const refresh = useCallback(() => router.invalidate(), [router])
  const { modal, setModal, deletingId, closeModal, handleModalSuccess, handleDelete } = useCategoryModal(refresh)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(groups[0]?.id ?? null)
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(() => new Set())

  const monthTransactions = useMemo(
    () => transactions.filter(tx => tx.amount > 0 && isSameMonth(tx.date, viewDate)),
    [transactions, viewDate]
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
          return {
            ...child,
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
      const budget = children.reduce((sum, child) => sum + child.budgetAmount, 0)
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
  }, [categoryMetrics, groups])

  const totals = useMemo(() => {
    const totalSpent = derivedGroups.reduce((sum, group) => sum + group.spent, 0)
    const totalBudget = derivedGroups.reduce((sum, group) => sum + group.budget, 0)
    const totalCategories = derivedGroups.reduce((sum, group) => sum + group.children.length, 0)
    const activeCategories = derivedGroups.reduce(
      (sum, group) => sum + group.children.filter(child => child.spent > 0).length,
      0
    )

    return { totalSpent, totalBudget, totalCategories, activeCategories }
  }, [derivedGroups])

  useEffect(() => {
    if (!derivedGroups.length) {
      setSelectedGroupId(null)
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

    const dailyBudget = selectedChild.budgetAmount > 0
      ? selectedChild.budgetAmount / daysInMonth
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
      return selectedChild.transactions
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }

    const groupCategoryIds = new Set(selectedGroup.children.map((child) => child.id))
    return monthTransactions
      .filter((tx) => tx.categoryId && groupCategoryIds.has(tx.categoryId))
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [monthTransactions, selectedChild, selectedGroup])

  const selectedRowId = selectedChildId !== null
    ? `child-${selectedChildId}`
    : selectedGroupId !== null
      ? `group-${selectedGroupId}`
      : null

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
            budget: child.budgetAmount,
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
        header: () => <span className="block text-left">Budget</span>,
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
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div className="lg:justify-self-start">
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="mt-0.5 text-sm text-default-400">
            {groups.length} group{groups.length !== 1 ? 's' : ''} · {groups.reduce((s, g) => s + g.children.length, 0)} categories
          </p>
        </div>

        <div className="flex justify-start lg:justify-center">
          <MonthControls transactions={transactions} />
        </div>

        <div className="flex items-center gap-3 lg:justify-self-end">
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
        totalSpent={totals.totalSpent}
        totalBudget={totals.totalBudget}
        activeCategories={totals.activeCategories}
        totalCategories={totals.totalCategories}
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
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
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
                            } else if (item.childId) {
                              setSelectedGroupId(item.groupId)
                              setSelectedChildId(item.childId)
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

          <Card className="overflow-hidden border border-divider/60 bg-content1 shadow-none">
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
                          className="group relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border border-divider/40 bg-default-50 text-2xl transition-colors hover:bg-default-100"
                          aria-label={selectedChild ? 'Edit category icon' : 'Edit group icon'}
                          title={selectedChild ? 'Edit category icon' : 'Edit group icon'}
                        >
                          <span>{selectedChild?.icon ?? selectedGroup.icon}</span>
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <PencilIcon size={14} className="text-white" />
                          </span>
                        </button>
                        <div className="min-w-0">
                          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                            {selectedChild ? selectedChild.name : selectedGroup.name}
                          </h2>
                          <p className="mt-1 text-sm text-default-400">
                            {selectedChild
                              ? `${selectedGroup.name}`
                              : 'Spending this month'}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="rounded-xl border border-divider/40 bg-default-50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.16em] text-default-400">Spent</p>
                              <p className="text-base font-bold text-foreground">
                                {formatCurrency(selectedChild?.spent ?? selectedGroup.spent, { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <div className="rounded-xl border border-divider/40 bg-default-50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.16em] text-default-400">Budget</p>
                              <p className="text-base font-bold text-foreground">
                                {formatCurrency(selectedChild?.budgetAmount ?? selectedGroup.budget, { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <div className="rounded-xl border border-divider/40 bg-default-50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.16em] text-default-400">Left</p>
                              <p className={`text-base font-bold ${(selectedChild ? selectedChild.budgetAmount : selectedGroup.budget) - (selectedChild ? selectedChild.spent : selectedGroup.spent) < 0 ? 'text-danger' : 'text-success'}`}>
                                {((selectedChild ? selectedChild.budgetAmount : selectedGroup.budget) - (selectedChild ? selectedChild.spent : selectedGroup.spent)) < 0 ? '-' : ''}
                                {formatCurrency(Math.abs((selectedChild ? selectedChild.budgetAmount : selectedGroup.budget) - (selectedChild ? selectedChild.spent : selectedGroup.spent)), { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                          </div>
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
                      </div>
                    </div>
                  </div>

                  <div className="border-b border-divider/30 px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
                        {selectedChild ? `${selectedChild.name} in ${monthLabel}` : `Spent in ${monthLabel}`}
                      </p>
                      <p className="text-sm font-semibold text-default-600">
                        {selectedChild
                          ? `${formatCurrency(selectedChild.spent, { maximumFractionDigits: 0 })} / ${formatCurrency(selectedChild.budgetAmount, { maximumFractionDigits: 0 })}`
                          : formatCurrency(selectedGroup.spent, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="h-36 w-full rounded-2xl border border-divider/40 bg-default-50 px-3 py-2">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                        minHeight={0}
                        initialDimension={{ width: 320, height: 144 }}
                      >
                        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
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
                            {chartData.map((entry) => (
                              <Cell key={`spent-${entry.day}`} fill="#22c55e" />
                            ))}
                          </Bar>
                          {selectedChild ? (
                            <Line type="monotone" dataKey="budget" stroke="#7dd3fc" strokeWidth={2} dot={false} />
                          ) : null}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="flex flex-col">
                      <div className="border-b border-divider/30 px-5 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-400">
                          Transactions
                        </p>
                      </div>
                      {selectedTransactions.length === 0 ? (
                        <div className="px-5 py-10 text-center text-sm italic text-default-400">
                          No transactions for this view
                        </div>
                      ) : (
                        selectedTransactions.slice(0, 12).map((tx, idx) => (
                          <div
                            key={tx.id}
                            className={`flex items-start justify-between gap-3 px-5 py-3 ${idx < Math.min(selectedTransactions.length, 12) - 1 ? 'border-b border-divider/20' : ''}`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{tx.merchantName}</p>
                              <p className="text-xs text-default-400">
                                {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {tx.account?.name ? ` · ${tx.account.name}` : ''}
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold text-foreground">
                              {formatCurrency(tx.amount, { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                        ))
                      )}
                  </div>
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
                <label className="text-xs text-default-400 font-medium">Monthly Budget <span className="text-default-300">(optional)</span></label>
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

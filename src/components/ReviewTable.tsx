import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { TagIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon, PlusIcon, CircleOffIcon } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalHeading,
  Input,
} from '@heroui/react'
import { formatCurrency } from '../lib/format'
import { markTransactionsReviewed, updateTransactionCategory } from '../server/transactions'
import { createCategory } from '../server/categories'

type Tx = {
  id: number
  amount: number
  date: Date | string
  merchantName: string
  isReviewed: boolean
  category: { id: number; name: string; icon: string | null } | null
}

type CategoryGroup = {
  id: number
  name: string
  icon: string | null
  children: { id: number; name: string; icon: string | null; budgetAmount: number }[]
}

const PAGE_SIZE = 10

const GROUP_COLORS = [
  '#f97316', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899',
  '#22c55e', '#0ea5e9', '#10b981', '#f43f5e', '#6366f1', '#71717a', '#94a3b8',
]

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dateLabel(dateVal: Date | string): string {
  const date = new Date(dateVal)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function ReviewTable({
  transactions,
  categories,
  showAll = false,
  searchQuery = '',
}: {
  transactions: Tx[]
  categories: CategoryGroup[]
  showAll?: boolean
  searchQuery?: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectAllPages, setSelectAllPages] = useState(false)
  const [page, setPage] = useState(0)
  const [pickerTxId, setPickerTxId] = useState<number | null>(null)
  const [catSearch, setCatSearch] = useState('')
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false)
  const [createTxId, setCreateTxId] = useState<number | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryIcon, setNewCategoryIcon] = useState('🏷️')
  const [newCategoryBudget, setNewCategoryBudget] = useState('')
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(categories[0]?.id ?? null)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)

  const query = searchQuery.toLowerCase()
  const visibleTxns = (showAll ? transactions : transactions.filter(tx => !tx.isReviewed))
    .filter(tx => !query || tx.merchantName.toLowerCase().includes(query))

  const total = visibleTxns.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageTxns = visibleTxns.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)

  const grouped: { label: string; txns: typeof pageTxns }[] = []
  for (const tx of pageTxns) {
    const label = dateLabel(tx.date)
    const g = grouped.find(x => x.label === label)
    if (g) g.txns.push(tx)
    else grouped.push({ label, txns: [tx] })
  }

  const allPageIds = pageTxns.map(tx => tx.id)
  const allTransactionIds = visibleTxns.map(tx => tx.id)
  const allPageSelected = allPageIds.length > 0 && allPageIds.every(id => selected.has(id))

  const toggleAll = () => {
    // First click: select all on current page
    // Second click (if all page selected): select all across all pages
    // Third click: deselect all
    if (selectAllPages) {
      setSelectAllPages(false)
      setSelected(new Set())
    } else if (allPageSelected) {
      setSelectAllPages(true)
      setSelected(new Set(allTransactionIds))
    } else {
      setSelected(prev => new Set([...prev, ...allPageIds]))
    }
  }

  const toggleOne = (id: number) => {
    // If "select all pages" is active, clicking one item deactivates it
    if (selectAllPages) {
      setSelectAllPages(false)
    }
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const markIds = selectAllPages ? allTransactionIds : (selected.size > 0 ? [...selected] : allPageIds)

  const handleMarkReviewed = async () => {
    if (!markIds.length) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (markTransactionsReviewed as any)({ data: { ids: markIds } })
    setSelected(new Set())
    setSelectAllPages(false)
    router.invalidate()
  }

  const handleCategoryChange = async (txId: number, categoryId: number | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (updateTransactionCategory as any)({ data: { id: txId, categoryId } })
    setPickerTxId(null)
    setCatSearch('')
    router.invalidate()
  }

  const getParentGroupId = (catId: number | null | undefined) => {
    if (!catId) return categories[0]?.id ?? null
    return categories.find(g => g.children.some(c => c.id === catId))?.id ?? categories[0]?.id ?? null
  }

  const openCreateCategoryModal = (tx: Tx) => {
    setCreateTxId(tx.id)
    setNewCategoryName(tx.merchantName)
    setNewCategoryIcon(tx.category?.icon ?? '🏷️')
    setNewCategoryBudget('')
    setNewCategoryParentId(getParentGroupId(tx.category?.id))
    setPickerTxId(null)
    setCatSearch('')
    setIsCreateCategoryOpen(true)
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || newCategoryParentId === null) return
    setIsCreatingCategory(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (createCategory as any)({
        data: {
          name: newCategoryName.trim(),
          icon: newCategoryIcon.trim() || '🏷️',
          budgetAmount: parseFloat(newCategoryBudget) || 0,
          parentId: newCategoryParentId,
        },
      })

      if (createTxId && created?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (updateTransactionCategory as any)({ data: { id: createTxId, categoryId: created.id } })
      }

      setIsCreateCategoryOpen(false)
      setCreateTxId(null)
      router.invalidate()
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const getCategoryColor = (catId: number | null | undefined) => {
    if (!catId) return '#71717a'
    const idx = categories.findIndex(g => g.children.some(c => c.id === catId))
    return GROUP_COLORS[Math.max(0, idx) % GROUP_COLORS.length]
  }

  const filteredGroups = catSearch
    ? categories
        .map(g => ({
          ...g,
          children: g.children.filter(c =>
            c.name.toLowerCase().includes(catSearch.toLowerCase())
          ),
        }))
        .filter(g => g.children.length > 0)
    : categories

  const start = clampedPage * PAGE_SIZE + 1
  const end = Math.min((clampedPage + 1) * PAGE_SIZE, total)

  if (total === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-default-300 italic">
          {showAll
            ? searchQuery ? 'No transactions match your search' : 'No transactions yet'
            : 'All caught up — no transactions to review'}
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Select-all header */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-divider/20 bg-default-50/20">
        <StyledCheckbox checked={selectAllPages || allPageSelected} onChange={toggleAll} aria-label="Select transactions" />
        <span className="text-xs text-default-400">
          {selectAllPages
            ? `All ${total} selected`
            : selected.size > 0
              ? `${selected.size} selected`
              : 'Select page or all'}
        </span>
      </div>

      {grouped.map(({ label, txns }) => (
        <div key={label}>
          <div className="px-6 py-1.5 text-xs font-semibold text-primary/80 bg-default-50/30 border-b border-divider/20">
            {label}
          </div>
          {txns.map(tx => {
            const color = getCategoryColor(tx.category?.id)
            return (
              <div
                key={tx.id}
                className="flex items-center px-6 py-3 hover:bg-default-100/40 transition-colors border-b border-divider/15 last:border-0 cursor-pointer"
                onClick={() => toggleOne(tx.id)}
              >
                <StyledCheckbox
                  checked={selectAllPages || selected.has(tx.id)}
                  onChange={() => toggleOne(tx.id)}
                  aria-label={`Select transaction ${tx.merchantName}`}
                  onClick={e => e.stopPropagation()}
                />

                <span className="ml-4 flex-1 text-sm font-medium truncate min-w-0">
                  {tx.merchantName}
                </span>

                <button className="ml-2 text-default-300 hover:text-default-500 transition-colors shrink-0 cursor-pointer" onClick={e => e.stopPropagation()}>
                  <TagIcon size={13} />
                </button>

                {/* Category badge + picker */}
                <div className="relative ml-3 shrink-0">
                  <Popover
                    isOpen={pickerTxId === tx.id}
                    onOpenChange={open => {
                      if (open) {
                        setPickerTxId(tx.id)
                        return
                      }
                      setPickerTxId(null)
                      setCatSearch('')
                    }}
                    placement="bottom"
                    shouldFlip
                    offset={8}
                  >
                    <PopoverTrigger>
                      <button
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase hover:opacity-80 transition-opacity cursor-pointer"
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        <span>{tx.category?.icon ?? '❓'}</span>
                        <span className="max-w-16 truncate">
                          {tx.category?.name ?? 'Uncategorized'}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-72 rounded-2xl overflow-hidden border border-divider bg-content1 shadow-lg">
                      <div className="flex max-h-[min(30rem,calc(100vh-4rem))] flex-col min-h-0">
                        <input
                          autoFocus
                          value={catSearch}
                          onChange={e => setCatSearch(e.target.value)}
                          placeholder="Search categories..."
                          className="w-full px-4 py-3 text-sm text-foreground bg-content2 border-b border-divider outline-none placeholder:text-default-400 shrink-0"
                        />
                        <div className="min-h-0 flex-1 overflow-y-auto py-1">
                          {filteredGroups.map(g => (
                            <div key={g.id} className="px-1.5 pb-1.5">
                              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-default-400">
                                {g.icon} {g.name}
                              </div>
                              {g.children.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => handleCategoryChange(tx.id, c.id)}
                                  className={`group w-full text-left px-2.5 py-2 text-sm rounded-xl flex items-center gap-2.5 transition-all cursor-pointer border ${tx.category?.id === c.id
                                    ? 'bg-success-soft border-success/50 text-success'
                                    : 'border-transparent text-default-700 hover:bg-content2 hover:border-divider hover:text-foreground'
                                  }`}
                                >
                                  <span className="text-base leading-none">{c.icon}</span>
                                  <span className="flex-1 truncate">{c.name}</span>
                                  {tx.category?.id === c.id && (
                                    <CheckIcon size={13} className="text-success shrink-0" />
                                  )}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                        <div className="sticky bottom-0 border-t border-divider px-1.5 py-1.5 bg-content1">
                          <button
                            onClick={() => openCreateCategoryModal(tx)}
                            className="w-full text-left px-2.5 py-2 text-sm rounded-xl flex items-center gap-2.5 transition-all cursor-pointer border border-transparent text-default-700 hover:bg-content2 hover:border-divider hover:text-foreground"
                          >
                            <PlusIcon size={14} className="shrink-0" />
                            <span>New category</span>
                          </button>
                          <button
                            onClick={() => handleCategoryChange(tx.id, null)}
                            className="w-full text-left px-2.5 py-2 text-sm rounded-xl flex items-center gap-2.5 transition-all cursor-pointer border border-transparent text-default-700 hover:bg-content2 hover:border-divider hover:text-foreground"
                          >
                            <CircleOffIcon size={14} className="shrink-0" />
                            <span>Exclude</span>
                          </button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <span
                  className={`ml-3 text-sm font-semibold tabular-nums w-20 text-right shrink-0 ${tx.amount < 0 ? 'text-success' : 'text-foreground'}`}
                >
                  {tx.amount < 0 ? '+' : ''}
                  {formatCurrency(Math.abs(tx.amount))}
                </span>

                <div className="ml-2.5 w-2 h-2 rounded-full shrink-0">
                  {showAll
                    ? tx.isReviewed
                      ? <CheckIcon size={12} className="text-success" />
                      : <div className="w-2 h-2 rounded-full bg-primary" />
                    : <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Footer: pagination + mark reviewed */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-divider/30">
        <div className="flex items-center gap-2">
          <span className="text-xs text-default-400">
            {start} – {end} of {total}
          </span>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-default-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeftIcon size={14} />
          </button>
          <button
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={clampedPage >= pageCount - 1}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-default-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronRightIcon size={14} />
          </button>
        </div>
        <button
          onClick={handleMarkReviewed}
          className={`flex items-center gap-2 px-4 py-2 bg-foreground text-background text-xs font-bold rounded-xl hover:opacity-80 transition-opacity cursor-pointer ${showAll ? 'invisible' : ''}`}
        >
          <CheckIcon size={13} />
          Mark {markIds.length} as reviewed
        </button>
      </div>

      <Modal
        isOpen={isCreateCategoryOpen}
        onOpenChange={open => {
          if (!open && !isCreatingCategory) setIsCreateCategoryOpen(false)
        }}
      >
        <ModalBackdrop variant="opaque" className="bg-black/55">
          <ModalContainer placement="center">
            <ModalDialog className="overflow-hidden rounded-3xl border border-divider bg-content1 shadow-2xl text-foreground p-0 max-w-xl">
              <ModalHeader className="flex items-center justify-between px-7 py-6 border-b border-divider">
                <ModalHeading className="text-4 font-bold text-foreground">New category</ModalHeading>
                <button
                  onClick={() => {
                    if (isCreatingCategory) return
                    setIsCreateCategoryOpen(false)
                  }}
                  className="w-8 h-8 rounded-full hover:bg-content2 text-default-400 transition-colors"
                >
                  ×
                </button>
              </ModalHeader>

              <ModalBody className="px-7 py-6 flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <input
                    value={newCategoryIcon}
                    onChange={e => setNewCategoryIcon(e.target.value)}
                    maxLength={4}
                    className="w-16 h-16 rounded-3xl bg-content2 border border-divider text-center text-2xl outline-none"
                  />
                  <Input
                    value={newCategoryName}
                    onValueChange={setNewCategoryName}
                    placeholder="Category name"
                    variant="bordered"
                    radius="lg"
                    classNames={{
                      inputWrapper: 'h-16 bg-content2 border-divider hover:border-default-400 data-[focus=true]:border-primary',
                      input: 'text-2xl font-semibold text-foreground',
                    }}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-2 font-semibold text-default-500">Group</label>
                  <select
                    value={newCategoryParentId ?? ''}
                    onChange={e => setNewCategoryParentId(e.target.value ? Number(e.target.value) : null)}
                    className="h-14 rounded-2xl px-4 bg-content2 border border-divider text-foreground outline-none"
                  >
                    {categories.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.icon} {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-2 font-semibold text-default-500">Budget</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={newCategoryBudget}
                    onValueChange={setNewCategoryBudget}
                    placeholder="0"
                    startContent={<span className="text-default-400 text-xl font-semibold">$</span>}
                    variant="bordered"
                    radius="lg"
                    classNames={{
                      inputWrapper: 'h-14 bg-content2 border-divider hover:border-default-400 data-[focus=true]:border-primary',
                      input: 'text-xl font-semibold text-foreground',
                    }}
                  />
                </div>
              </ModalBody>

              <ModalFooter className="flex items-center justify-end gap-3 px-7 py-5 border-t border-divider bg-content1">
                <Button
                  variant="flat"
                  onPress={() => setIsCreateCategoryOpen(false)}
                  isDisabled={isCreatingCategory}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onPress={handleCreateCategory}
                  isDisabled={isCreatingCategory || !newCategoryName.trim() || newCategoryParentId === null}
                  className="rounded-xl"
                >
                  {isCreatingCategory ? 'Creating...' : 'Create'}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  )
}

function StyledCheckbox({
  checked,
  onChange,
  onClick,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onChange: () => void
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void
  'aria-label'?: string
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      aria-label={ariaLabel}
      className="cursor-pointer w-4 h-4 shrink-0 rounded accent-primary border border-default-400 bg-content2"
    />
  )
}

import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  Card, CardContent, Button,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover,
  ProgressBar,
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
  PieChartIcon, Loader2Icon, XIcon,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import {
  getCategoriesWithSpending,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../server/categories'
import { formatCurrency } from '../lib/format'

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth()
  if (!isAuthenticated) throw redirect({ to: '/sign-in/$' })
})

export const Route = createFileRoute('/categories')({
  component: Categories,
  beforeLoad: async () => await authStateFn(),
  loader: () => getCategoriesWithSpending(),
})

type LoadedGroup = Awaited<ReturnType<typeof getCategoriesWithSpending>>[number]
type LoadedChild = LoadedGroup['children'][number]

type ModalState =
  | { mode: 'create-group' }
  | { mode: 'create-child'; parentId: number; parentName: string }
  | { mode: 'edit-group'; category: LoadedGroup }
  | { mode: 'edit-child'; category: LoadedChild }

function progressColor(spent: number, budget: number): 'success' | 'warning' | 'danger' | 'default' {
  if (budget === 0) return 'default'
  const pct = (spent / budget) * 100
  if (pct >= 100) return 'danger'
  if (pct >= 80) return 'warning'
  return 'success'
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

function Categories() {
  const router = useRouter()
  const groups = Route.useLoaderData()
  const refresh = useCallback(() => router.invalidate(), [router])
  const { modal, setModal, deletingId, closeModal, handleModalSuccess, handleDelete } = useCategoryModal(refresh)

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories & Budgets</h1>
          <p className="text-sm text-default-400 mt-0.5">{groups.length} group{groups.length !== 1 ? 's' : ''} · {groups.reduce((s, g) => s + g.children.length, 0)} categories</p>
        </div>
        <Button variant="primary" size="sm" onPress={() => setModal({ mode: 'create-group' })}>
          <PlusIcon size={15} />
          New Group
        </Button>
      </div>

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {groups.map(group => {
            const groupSpent = group.children.reduce((s, c) => s + c.spent, 0)
            const groupBudget = group.children.reduce((s, c) => s + c.budgetAmount, 0)

            return (
              <Card
                key={group.id}
                className="w-full bg-background/60 backdrop-blur-md border-divider/50 overflow-hidden"
              >
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-divider/50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-default-100/80 flex items-center justify-center text-base border border-divider/20">
                      {group.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm leading-tight">{group.name}</h4>
                      {groupBudget > 0 ? (
                        <p className="text-[11px] text-default-400 leading-tight">
                          {formatCurrency(groupSpent, { maximumFractionDigits: 0 })} / {formatCurrency(groupBudget, { maximumFractionDigits: 0 })}
                        </p>
                      ) : (
                        <p className="text-[11px] text-default-400 leading-tight">
                          {group.children.length} {group.children.length === 1 ? 'category' : 'categories'}
                        </p>
                      )}
                    </div>
                  </div>
                  <Dropdown>
                    <DropdownTrigger>
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex items-center justify-center rounded-lg h-7 w-7 hover:bg-default-100 cursor-pointer text-default-400 transition-colors"
                        aria-label="Group actions"
                      >
                        {deletingId === group.id
                          ? <Loader2Icon size={14} className="animate-spin" />
                          : <MoreVerticalIcon size={14} />}
                      </div>
                    </DropdownTrigger>
                    <DropdownPopover>
                      <DropdownMenu aria-label="Group actions">
                        <DropdownItem key="edit" onAction={() => setModal({ mode: 'edit-group', category: group })}>
                          <div className="flex items-center gap-2">
                            <PencilIcon size={13} />
                            <span>Edit Group</span>
                          </div>
                        </DropdownItem>
                        <DropdownItem key="delete" className="text-danger" onAction={() => handleDelete(group.id, true)}>
                          <div className="flex items-center gap-2">
                            <Trash2Icon size={13} />
                            <span>Delete Group</span>
                          </div>
                        </DropdownItem>
                      </DropdownMenu>
                    </DropdownPopover>
                  </Dropdown>
                </div>

                {/* Category rows */}
                <CardContent className="px-0 py-0">
                  <div className="flex flex-col">
                    {group.children.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-default-400 text-center italic">
                        No categories yet
                      </div>
                    ) : (
                      group.children.map((child, idx) => {
                        const pct = child.budgetAmount > 0
                          ? Math.min((child.spent / child.budgetAmount) * 100, 100)
                          : 0

                        return (
                          <div
                            key={child.id}
                            className={`flex flex-col gap-2 px-4 py-3 hover:bg-default-50/40 transition-colors group relative ${idx < group.children.length - 1 ? 'border-b border-divider/30' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-base flex-shrink-0">{child.icon}</span>
                                <div className="min-w-0">
                                  <span className="font-medium text-sm text-default-700 group-hover:text-primary transition-colors block truncate">
                                    {child.name}
                                  </span>
                                  <span className="text-[11px] text-default-400">
                                    {child.txCount} tx
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <div className="text-right">
                                  <span className="font-semibold text-sm text-default-800">
                                    {formatCurrency(child.spent, { maximumFractionDigits: 0 })}
                                  </span>
                                  {child.budgetAmount > 0 && (
                                    <span className="text-[11px] text-default-400 block">
                                      / {formatCurrency(child.budgetAmount, { maximumFractionDigits: 0 })}
                                    </span>
                                  )}
                                </div>
                                <Dropdown>
                                  <DropdownTrigger>
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md h-6 w-6 hover:bg-default-100 cursor-pointer text-default-400"
                                      aria-label="Category actions"
                                    >
                                      {deletingId === child.id
                                        ? <Loader2Icon size={12} className="animate-spin" />
                                        : <MoreVerticalIcon size={12} />}
                                    </div>
                                  </DropdownTrigger>
                                  <DropdownPopover>
                                    <DropdownMenu aria-label="Category actions">
                                      <DropdownItem key="edit" onAction={() => setModal({ mode: 'edit-child', category: child })}>
                                        <div className="flex items-center gap-2">
                                          <PencilIcon size={13} />
                                          <span>Edit</span>
                                        </div>
                                      </DropdownItem>
                                      <DropdownItem key="delete" className="text-danger" onAction={() => handleDelete(child.id, false)}>
                                        <div className="flex items-center gap-2">
                                          <Trash2Icon size={13} />
                                          <span>Delete</span>
                                        </div>
                                      </DropdownItem>
                                    </DropdownMenu>
                                  </DropdownPopover>
                                </Dropdown>
                              </div>
                            </div>

                            {child.budgetAmount > 0 && (
                              <ProgressBar
                                value={pct}
                                color={progressColor(child.spent, child.budgetAmount)}
                                className="h-1"
                              />
                            )}
                          </div>
                        )
                      })
                    )}

                    <div className="px-4 py-3 border-t border-divider/30">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onPress={() => setModal({ mode: 'create-child', parentId: group.id, parentName: group.name })}
                      >
                        <PlusIcon size={13} />
                        Add Category
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
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
  const [name, setName] = useState(existing?.name ?? '')
  const [budget, setBudget] = useState(
    existing && 'budgetAmount' in existing ? String(existing.budgetAmount || '') : ''
  )
  const [saving, setSaving] = useState(false)

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
        <ModalContainer placement="center">
          <ModalDialog className="w-full max-w-sm rounded-2xl border border-divider/50 bg-background shadow-2xl p-0 overflow-hidden">
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

          <ModalBody className="px-5 py-4 flex flex-col gap-4">
            <div className="flex gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-default-400 font-medium">Icon</label>
                <Input
                  aria-label="Icon"
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  placeholder={isGroup ? '📁' : '📌'}
                  maxLength={4}
                  className="w-16 text-center text-lg"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-default-400 font-medium">Name</label>
                <Input
                  aria-label="Name"
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={isGroup ? 'e.g. Food & Dining' : 'e.g. Groceries'}
                  required
                />
              </div>
            </div>

            {!isGroup && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-default-400 font-medium">Monthly Budget <span className="text-default-300">(optional)</span></label>
                <Input
                  aria-label="Monthly budget"
                  type="number"
                  min="0"
                  step="1"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-default-300">Leave at $0 to track spending without a cap.</p>
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

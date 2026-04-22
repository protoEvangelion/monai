import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  Card, CardHeader, CardContent, Separator, Button,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover,
  ProgressBar,
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
import {
  PlusIcon, MoreVerticalIcon, Trash2Icon, PencilIcon,
  PieChartIcon, Loader2Icon, XIcon,
} from 'lucide-react'
import { useState } from 'react'
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

function Categories() {
  const router = useRouter()
  const groups = Route.useLoaderData()
  const [modal, setModal] = useState<ModalState | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const refresh = () => router.invalidate()

  const handleDelete = async (id: number, isGroup: boolean) => {
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
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold tracking-tight">Categories & Budgets</h1>
        <Button variant="primary" onPress={() => setModal({ mode: 'create-group' })}>
          <PlusIcon size={18} />
          New Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card className="w-full bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5 border-divider/50">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center">
              <PieChartIcon size={32} className="text-default-400" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-lg">No categories yet</p>
              <p className="text-sm text-default-400 max-w-xs">Create a group to start organizing your spending and setting budgets.</p>
            </div>
            <Button variant="primary" size="sm" onPress={() => setModal({ mode: 'create-group' })}>
              <PlusIcon size={16} /> New Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(group => {
            const groupSpent = group.children.reduce((s, c) => s + c.spent, 0)
            const groupBudget = group.children.reduce((s, c) => s + c.budgetAmount, 0)

            return (
              <Card
                key={group.id}
                className="w-full bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5 border-divider/50 overflow-hidden"
              >
                <CardHeader className="flex justify-between items-center px-6 pt-5 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-default-100/70 flex items-center justify-center text-xl shadow-sm border border-divider/20">
                      {group.icon}
                    </div>
                    <h4 className="font-bold text-lg tracking-tight">{group.name}</h4>
                  </div>
                  <div className="flex items-center gap-3">
                    {groupBudget > 0 && (
                      <div className="text-sm text-default-400 font-medium">
                        <span className="text-default-700 font-bold">{formatCurrency(groupSpent, { maximumFractionDigits: 0 })}</span>
                        {' / '}
                        {formatCurrency(groupBudget, { maximumFractionDigits: 0 })}
                      </div>
                    )}
                    <Dropdown>
                      <DropdownTrigger>
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex items-center justify-center rounded-full h-8 w-8 hover:bg-default-100 cursor-pointer text-default-400"
                        >
                          {deletingId === group.id
                            ? <Loader2Icon size={16} className="animate-spin" />
                            : <MoreVerticalIcon size={16} />}
                        </div>
                      </DropdownTrigger>
                      <DropdownPopover>
                        <DropdownMenu aria-label="Group actions">
                          <DropdownItem key="edit" onAction={() => setModal({ mode: 'edit-group', category: group })}>
                            <div className="flex items-center gap-2">
                              <PencilIcon size={14} />
                              <span>Edit Group</span>
                            </div>
                          </DropdownItem>
                          <DropdownItem key="delete" className="text-danger" onAction={() => handleDelete(group.id, true)}>
                            <div className="flex items-center gap-2">
                              <Trash2Icon size={14} />
                              <span>Delete Group</span>
                            </div>
                          </DropdownItem>
                        </DropdownMenu>
                      </DropdownPopover>
                    </Dropdown>
                  </div>
                </CardHeader>

                <Separator className="opacity-50" />

                <CardContent className="px-0 py-0">
                  <div className="flex flex-col divide-y divide-divider/50">
                    {group.children.length === 0 ? (
                      <div className="px-6 py-4 text-sm text-default-400 text-center">
                        No categories yet — add one below
                      </div>
                    ) : (
                      group.children.map(child => {
                        const pct = child.budgetAmount > 0
                          ? Math.min((child.spent / child.budgetAmount) * 100, 100)
                          : 0

                        return (
                          <div
                            key={child.id}
                            className="flex flex-col gap-2.5 px-6 py-4 hover:bg-default-50/50 transition-all group relative"
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-default-100/70 flex items-center justify-center text-base shadow-sm border border-divider/20">
                                  {child.icon}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-semibold text-default-800 group-hover:text-primary transition-colors">
                                    {child.name}
                                  </span>
                                  <span className="text-[11px] text-default-400 font-bold uppercase tracking-wider">
                                    {child.txCount} transaction{child.txCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-bold text-default-800">
                                    {formatCurrency(child.spent, { maximumFractionDigits: 0 })}
                                  </span>
                                  {child.budgetAmount > 0 && (
                                    <span className="text-xs text-default-400">
                                      of {formatCurrency(child.budgetAmount, { maximumFractionDigits: 0 })}
                                    </span>
                                  )}
                                </div>
                                <Dropdown>
                                  <DropdownTrigger>
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full h-7 w-7 hover:bg-default-100 cursor-pointer text-default-400"
                                    >
                                      {deletingId === child.id
                                        ? <Loader2Icon size={14} className="animate-spin" />
                                        : <MoreVerticalIcon size={14} />}
                                    </div>
                                  </DropdownTrigger>
                                  <DropdownPopover>
                                    <DropdownMenu aria-label="Category actions">
                                      <DropdownItem key="edit" onAction={() => setModal({ mode: 'edit-child', category: child })}>
                                        <div className="flex items-center gap-2">
                                          <PencilIcon size={14} />
                                          <span>Edit Category</span>
                                        </div>
                                      </DropdownItem>
                                      <DropdownItem key="delete" className="text-danger" onAction={() => handleDelete(child.id, false)}>
                                        <div className="flex items-center gap-2">
                                          <Trash2Icon size={14} />
                                          <span>Delete Category</span>
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
                                className="h-1.5"
                              />
                            )}
                          </div>
                        )
                      })
                    )}

                    <div className="px-6 py-3">
                      <button
                        onClick={() => setModal({ mode: 'create-child', parentId: group.id, parentName: group.name })}
                        className="flex items-center gap-2 text-sm text-default-400 hover:text-primary transition-colors font-medium"
                      >
                        <PlusIcon size={14} />
                        Add Category
                      </button>
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
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); refresh() }}
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
      <ModalBackdrop variant="opaque" className="bg-black/50" />
      <ModalContainer placement="center">
        <ModalDialog className="w-full max-w-md rounded-2xl border border-divider/50 bg-background shadow-2xl p-0 overflow-hidden">
          <ModalHeader className="flex items-center justify-between px-6 py-5 border-b border-divider/50">
            <ModalHeading className="font-bold text-lg tracking-tight">{title}</ModalHeading>
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              radius="full"
              onPress={onClose}
              isDisabled={saving}
            >
              <XIcon size={16} />
            </Button>
          </ModalHeader>

          <ModalBody className="px-6 py-5 flex flex-col gap-5">
            <div className="flex gap-3 items-end">
              <Input
                label="Icon"
                value={icon}
                onValueChange={setIcon}
                placeholder={isGroup ? '📁' : '📌'}
                maxLength={4}
                className="w-20"
                classNames={{ input: 'text-2xl text-center' }}
              />
              <Input
                autoFocus
                label="Name"
                value={name}
                onValueChange={setName}
                placeholder={isGroup ? 'e.g. Food & Dining' : 'e.g. Groceries'}
                isRequired
                className="flex-1"
              />
            </div>

            {!isGroup && (
              <div className="flex flex-col gap-1.5">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  label="Monthly Budget"
                  value={budget}
                  onValueChange={setBudget}
                  placeholder="0"
                  startContent={<span className="text-default-400 font-semibold text-sm">$</span>}
                />
                <p className="text-[11px] text-default-400">Leave at $0 to track spending without a budget cap.</p>
              </div>
            )}
          </ModalBody>

          <ModalFooter className="flex gap-3 pt-1 px-6 pb-6">
            <Button
              variant="secondary"
              className="flex-1"
              onPress={onClose}
              isDisabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onPress={handleSave}
              isDisabled={saving || !name.trim()}
            >
              {saving ? <Loader2Icon size={16} className="animate-spin" /> : null}
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </ModalFooter>
        </ModalDialog>
      </ModalContainer>
    </Modal>
  )
}

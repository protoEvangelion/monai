import { Button } from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  createCategorizationRule,
  deleteCategorizationRule,
  updateCategorizationRule,
  getCategorizationRules,
} from "../../../server/rules.fns";
import { getCategories } from "../../../server/categories.fns";
import { showToast } from "../../shared/toast";

type RuleRow = Awaited<ReturnType<typeof getCategorizationRules>>[number];
type CategoryGroup = Awaited<ReturnType<typeof getCategories>>[number];
type TransactionType = "regular" | "income" | "transfer";

function RuleForm({
  categories,
  initial,
  onCancel,
  onSaved,
}: {
  categories: CategoryGroup[];
  initial?: {
    id?: number;
    pattern: string;
    categoryId: number | null;
    transactionType: TransactionType;
  };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pattern, setPattern] = useState(initial?.pattern ?? "");
  const [transactionType, setTransactionType] = useState<TransactionType>(
    initial?.transactionType ?? "regular",
  );
  const [categoryId, setCategoryId] = useState<number | "">(
    initial?.categoryId ?? "",
  );
  const [pending, startTransition] = useTransition();

  const leafOptions = useMemo(
    () =>
      categories.flatMap((group) =>
        group.children.map((child) => ({
          id: child.id,
          label: `${group.icon ?? ""} ${group.name} / ${child.icon ?? ""} ${child.name}`.trim(),
        })),
      ),
    [categories],
  );

  const save = () => {
    startTransition(async () => {
      try {
        const payload = {
          pattern: pattern.trim(),
          transactionType,
          categoryId: transactionType === "regular" ? Number(categoryId) || null : null,
          applyToExisting: true,
        };
        if (initial?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (updateCategorizationRule as any)({ data: { id: initial.id, ...payload } });
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (createCategorizationRule as any)({ data: payload });
        }
        showToast({
          title: initial?.id ? "Rule updated" : "Rule created",
          description: "Matching transactions were categorized.",
        });
        onSaved();
      } catch (error) {
        showToast({
          title: "Could not save rule",
          description: error instanceof Error ? error.message : "Try again.",
          tone: "danger",
        });
      }
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-divider/60 bg-content1 p-4">
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
          Match text
        </label>
        <input
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
          placeholder="e.g. disney plus"
          className="h-11 w-full rounded-xl border border-divider bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
        />
        <p className="mt-1 text-xs text-default-400">
          Fuzzy-matches merchant names on future (and existing) transactions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
            Type
          </label>
          <select
            value={transactionType}
            onChange={(event) => setTransactionType(event.target.value as TransactionType)}
            className="h-11 w-full rounded-xl border border-divider bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
          >
            <option value="regular">Category</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
        {transactionType === "regular" ? (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-default-400">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(event) =>
                setCategoryId(event.target.value ? Number(event.target.value) : "")
              }
              className="h-11 w-full rounded-xl border border-divider bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
            >
              <option value="">Select category</option>
              {leafOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onPress={onCancel} isDisabled={pending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onPress={save}
          isDisabled={pending || !pattern.trim()}
        >
          {pending ? <Loader2Icon size={14} className="animate-spin" /> : null}
          {initial?.id ? "Save" : "Create rule"}
        </Button>
      </div>
    </div>
  );
}

export function RulesScreen({
  rules,
  categories,
  initialPattern,
}: {
  rules: RuleRow[];
  categories: CategoryGroup[];
  initialPattern?: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(Boolean(initialPattern));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.invalidate();

  const handleDelete = (id: number) => {
    if (!confirm("Delete this rule? Transactions keep their current category.")) return;
    setDeletingId(id);
    startTransition(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (deleteCategorizationRule as any)({ data: { id } });
        await refresh();
      } catch (error) {
        showToast({
          title: "Could not delete rule",
          description: error instanceof Error ? error.message : "Try again.",
          tone: "danger",
        });
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rules</h1>
          <p className="mt-0.5 text-sm text-default-400">
            Auto-categorize matching merchants before AI runs.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onPress={() => {
            setEditingId(null);
            setCreating(true);
          }}
        >
          <PlusIcon size={14} /> Add Rule
        </Button>
      </div>

      {creating ? (
        <RuleForm
          categories={categories}
          initial={
            initialPattern
              ? { pattern: initialPattern, categoryId: null, transactionType: "regular" }
              : undefined
          }
          onCancel={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-divider/60 bg-content1">
        {rules.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-default-400">
            No rules yet. Add one to remember merchants like “Disney+”.
          </div>
        ) : (
          <div className="divide-y divide-divider/50">
            {rules.map((rule) =>
              editingId === rule.id ? (
                <div key={rule.id} className="p-4">
                  <RuleForm
                    categories={categories}
                    initial={{
                      id: rule.id,
                      pattern: rule.pattern,
                      categoryId: rule.categoryId,
                      transactionType: rule.transactionType,
                    }}
                    onCancel={() => setEditingId(null)}
                    onSaved={async () => {
                      setEditingId(null);
                      await refresh();
                    }}
                  />
                </div>
              ) : (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">“{rule.pattern}”</div>
                    <div className="text-xs text-default-400">
                      {rule.transactionType === "regular"
                        ? `${rule.category?.icon ?? ""} ${rule.category?.name ?? "Category"}`.trim()
                        : rule.transactionType === "income"
                          ? "Income"
                          : "Transfer"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setCreating(false);
                        setEditingId(rule.id);
                      }}
                      isDisabled={pending}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      aria-label="Delete rule"
                      onPress={() => handleDelete(rule.id)}
                      isDisabled={deletingId === rule.id}
                    >
                      {deletingId === rule.id ? (
                        <Loader2Icon size={14} className="animate-spin" />
                      ) : (
                        <Trash2Icon size={14} />
                      )}
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

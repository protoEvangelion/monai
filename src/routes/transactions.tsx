import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  InputGroup,
  InputGroupPrefix,
  InputGroupInput,
  Button,
} from "@heroui/react";
import { SearchIcon, RefreshCwIcon, Loader2Icon } from "lucide-react";
import { getTransactions } from '../server/transactions';
import { getCategoriesWithSpending } from '../server/categories';
import { manualSync } from '../server/plaid';
import { useState } from 'react';
import { ReviewTable } from '../components/ReviewTable';

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated } = await getAuthOrDevAuth()
  if (!isAuthenticated) throw redirect({ to: '/sign-in/$' })
})

export const Route = createFileRoute('/transactions')({
  component: Transactions,
  beforeLoad: async () => await authStateFn(),
  loader: async () => {
    const [transactions, categories] = await Promise.all([
      getTransactions(),
      getCategoriesWithSpending(),
    ])
    return { transactions, categories }
  },
})

function Transactions() {
  const { transactions, categories } = Route.useLoaderData()
  const router = useRouter()
  const [isSyncing, setIsSyncing] = useState(false)
  const [search, setSearch] = useState('')

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await manualSync()
      router.invalidate()
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <InputGroup>
            <InputGroupPrefix className="pl-3">
              <SearchIcon size={16} className="text-default-400" />
            </InputGroupPrefix>
            <InputGroupInput
              placeholder="Search transactions..."
              value={search}
              onChange={e => setSearch((e.target as HTMLInputElement).value)}
            />
          </InputGroup>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onPress={handleSync}
          isDisabled={isSyncing}
          className="cursor-pointer"
        >
          {isSyncing
            ? <Loader2Icon size={15} className="animate-spin" />
            : <RefreshCwIcon size={15} />}
          Sync
        </Button>
      </div>

      <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm overflow-hidden">
        <ReviewTable
          transactions={transactions}
          categories={categories}
          showAll
          searchQuery={search}
        />
      </div>
    </div>
  )
}


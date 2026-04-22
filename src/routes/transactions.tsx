import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import {
  InputGroup,
  InputGroupPrefix,
  InputGroupInput,
  Button,
  Card,
  CardContent
} from "@heroui/react";
import { SearchIcon, PlusIcon, FilterIcon, TagIcon, RefreshCwIcon, Loader2Icon } from "lucide-react";
import { getTransactions } from '../server/transactions';
import { manualSync } from '../server/plaid';
import { useState } from 'react';
import { formatCurrency } from '../lib/format';

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await getAuthOrDevAuth()

  if (!isAuthenticated) {
    throw redirect({
      to: '/sign-in/$',
    })
  }

  return { userId }
})

export const Route = createFileRoute('/transactions')({
  component: Transactions,
  beforeLoad: async () => await authStateFn(),
  loader: () => getTransactions(),
})

function Transactions() {
  const transactions = Route.useLoaderData()
  const router = useRouter()
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await manualSync()
      router.invalidate()
    } finally {
      setIsSyncing(false)
    }
  }

  const groupedTransactions = transactions.reduce((acc, tx) => {
    const date = new Date(tx.date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
    
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(tx)
    return acc
  }, {} as Record<string, typeof transactions>)

  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  )

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-end gap-3 mb-2">
        <div className="grow max-w-md">
          <h1 className="text-3xl font-bold mb-4 tracking-tight">Transactions</h1>
          <InputGroup>
            <InputGroupPrefix className="pl-3">
              <SearchIcon size={18} className="text-default-400" />
            </InputGroupPrefix>
            <InputGroupInput placeholder="Search transactions..." />
          </InputGroup>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary">
            <FilterIcon size={18} />
            Filter
          </Button>
          <Button variant="primary">
            <PlusIcon size={18} />
            Add New
          </Button>
        </div>
      </div>

      <Card className="w-full bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5 border-divider/50">
        <CardContent className="px-0 py-0">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
               <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center">
                <ArrowLeftRightIcon size={32} className="text-default-400" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-lg">No transactions yet</p>
                <p className="text-sm text-default-400 max-w-xs">Connect your accounts via Plaid or click "Sync" to fetch your financial history.</p>
              </div>
              <Button variant="primary" size="sm" onPress={handleSync} isDisabled={isSyncing} className="mt-2">
                {isSyncing ? <Loader2Icon size={16} className="animate-spin mr-1" /> : <RefreshCwIcon size={16} className="mr-1" />}
                Sync Now
              </Button>
            </div>
          ) : (
            <div className="flex flex-col">
              {sortedDates.map((date) => (
                <div key={date} className="flex flex-col">
                  <div className="px-6 py-2 bg-default-50/50 border-y border-divider/50 font-bold text-[10px] uppercase tracking-widest text-default-400 first:border-t-0">
                    {date}
                  </div>
                  <div className="flex flex-col divide-y divide-divider/50">
                    {groupedTransactions[date].map((tx) => (
                      <div key={tx.id} className="flex justify-between items-center px-6 py-4 hover:bg-default-50/50 transition-all cursor-pointer group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-default-100 flex items-center justify-center text-xl shadow-sm border border-divider/20">
                            {tx.category?.icon || '💸'}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-default-800 group-hover:text-primary transition-colors">
                              {tx.merchantName}
                            </span>
                            <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="secondary" className="h-6 text-[10px] px-2 uppercase tracking-wider font-bold">
                                <TagIcon size={10} className="mr-1" /> Add tag
                              </Button>
                              <Button variant="secondary" className="h-6 text-[10px] px-2 uppercase tracking-wider font-bold">
                                {tx.category?.name || 'Uncategorized'}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {!tx.isReviewed && (
                            <div className="relative flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-danger animate-ping absolute opacity-60" />
                              <div className="w-2 h-2 rounded-full bg-danger" />
                            </div>
                          )}
                          <span className={`font-bold text-lg tracking-tight ${tx.amount > 0 ? 'text-success' : 'text-default-800'}`}>
                            {formatCurrency(tx.amount, { withSign: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { ArrowLeftRightIcon } from 'lucide-react'

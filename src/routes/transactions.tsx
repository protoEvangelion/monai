import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { 
  InputGroup,
  InputGroupPrefix,
  InputGroupInput,
  Button,
  Card,
  CardContent
} from "@heroui/react";
import { SearchIcon, PlusIcon, FilterIcon, TagIcon } from "lucide-react";

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await auth()

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
})

const transactionsGroups = [
  {
    date: 'Yesterday',
    transactions: [
      { id: 1, merchant: 'Venmo', amount: -150.00, icon: '🤷‍♂️', category: 'Other', status: 'to-review' },
      { id: 2, merchant: 'Kroger', amount: -38.42, icon: '💊', category: 'Drugs', status: 'to-review' },
      { id: 3, merchant: 'Grace Bible Church', amount: -5.00, icon: '🤷‍♂️', category: 'Other', status: 'to-review' },
    ]
  },
  {
    date: 'Saturday, April 18',
    transactions: [
      { id: 4, merchant: 'Scooters Coffee', amount: -12.88, icon: '🍔', category: 'Restaurants', status: 'to-review' },
      { id: 5, merchant: 'Target', amount: -45.60, icon: '🏠', category: 'Household', status: 'reviewed' },
    ]
  },
  {
    date: 'Friday, April 17',
    transactions: [
      { id: 6, merchant: 'Apple', amount: -1200.00, icon: '💻', category: 'Tech', status: 'reviewed' },
      { id: 7, merchant: 'Rent', amount: -2100.00, icon: '🏠', category: 'Housing', status: 'reviewed' },
      { id: 8, merchant: 'Salary', amount: 4500.00, icon: '💰', category: 'Income', status: 'reviewed' },
    ]
  }
];

function Transactions() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-end gap-3 mb-2">
        <div className="flex-grow max-w-md">
          <h1 className="text-3xl font-bold mb-4">Transactions</h1>
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

      <Card className="w-full bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5">
        <CardContent className="px-0 py-0">
          <div className="flex flex-col">
            {transactionsGroups.map((group, groupIndex) => (
              <div key={group.date} className="flex flex-col">
                <div className="px-6 py-2 bg-default-50 border-y border-divider font-medium text-sm text-default-500 first:border-t-0">
                  {group.date}
                </div>
                <div className="flex flex-col divide-y divide-divider">
                  {group.transactions.map((tx) => (
                    <div key={tx.id} className="flex justify-between items-center px-6 py-4 hover:bg-default-100 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-default-100 flex items-center justify-center text-xl">
                          {tx.icon}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-base">{tx.merchant}</span>
                          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="secondary" className="h-6 text-xs px-2">
                              <TagIcon size={12} className="mr-1" /> Add tag
                            </Button>
                            <Button variant="secondary" className="h-6 text-xs px-2">
                              <span className="mr-1">{tx.icon}</span> {tx.category}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {tx.status === 'to-review' && (
                          <div className="relative flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-danger animate-ping absolute opacity-60" />
                            <div className="w-2 h-2 rounded-full bg-danger" />
                          </div>
                        )}
                        <span className={`font-semibold text-lg ${tx.amount > 0 ? 'text-success' : 'text-default-800'}`}>
                          {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

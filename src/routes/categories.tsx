import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { Card, CardHeader, CardContent, Separator, Button, ProgressBar } from '@heroui/react'
import { PlusIcon } from 'lucide-react'

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated) {
    throw redirect({
      to: '/sign-in/$',
    })
  }

  return { userId }
})

export const Route = createFileRoute('/categories')({
  component: Categories,
  beforeLoad: async () => await authStateFn(),
})

const categoriesData = [
  { name: 'Household', spent: 2136, budgeted: 6428, txCount: 9, icon: '🏠', color: 'accent' },
  { name: 'Food', spent: 1160, budgeted: 1400, txCount: 2, icon: '🍔', color: 'accent' },
  { name: 'Giving', spent: 592, budgeted: 1050, txCount: 2, icon: 'success' },
  { name: 'Auto', spent: 421, budgeted: 650, txCount: 2, icon: '🚗', color: 'warning' },
  { name: 'Fun', spent: 320, budgeted: 450, txCount: 3, icon: '🎉', color: 'danger' },
  { name: 'Subscriptions', spent: 45, budgeted: 100, txCount: 4, icon: '🔄', color: 'secondary' },
  { name: 'Travel', spent: 0, budgeted: 500, txCount: 0, icon: '✈️', color: 'default' },
];

function Categories() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold">Categories & Budgets</h1>
        <Button variant="primary">
          <PlusIcon size={18} />
          New Category
        </Button>
      </div>

      <Card className="w-full">
        <CardHeader className="px-6 pt-5 pb-3">
          <h4 className="font-semibold text-lg">Monthly Targets</h4>
        </CardHeader>
        <Separator />
        <CardContent className="px-0 py-0">
          <div className="flex flex-col divide-y divide-divider">
            {categoriesData.map(cat => {
              const progress = cat.budgeted > 0 ? (cat.spent / cat.budgeted) * 100 : 0;
              return (
                <div key={cat.name} className="flex flex-col gap-3 px-6 py-5 hover:bg-default-50 transition-colors cursor-pointer group">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-default-100 flex items-center justify-center text-2xl">
                        {cat.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-lg">{cat.name}</span>
                        <span className="text-sm text-default-400">{cat.txCount} transactions</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-lg">${cat.spent.toLocaleString()}</span>
                      <span className="text-sm text-default-400">of ${cat.budgeted.toLocaleString()}</span>
                    </div>
                  </div>
                  <ProgressBar 
                    value={progress} 
                    color={cat.color as any} 
                    className="h-2 opacity-80 group-hover:opacity-100 transition-opacity mt-1" 
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

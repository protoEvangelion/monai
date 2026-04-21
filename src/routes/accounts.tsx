import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { Card, CardHeader, CardContent, Separator, Button } from '@heroui/react'
import { CreditCardIcon, LandmarkIcon, TrendingUpIcon, HomeIcon, BriefcaseIcon, PlusIcon } from 'lucide-react'

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated) {
    throw redirect({
      to: '/sign-in/$',
    })
  }

  return { userId }
})

export const Route = createFileRoute('/accounts')({
  component: Accounts,
  beforeLoad: async () => await authStateFn(),
})

const accountGroups = [
  {
    type: 'Credit card',
    icon: <CreditCardIcon size={20} className="text-primary" />,
    accounts: [
      { id: 1, name: 'Prime Visa', balance: 2568 },
      { id: 2, name: 'Ultimate Rewards®', balance: 0 },
    ],
    isDebt: true
  },
  {
    type: 'Depository',
    icon: <LandmarkIcon size={20} className="text-success" />,
    accounts: [
      { id: 3, name: 'Chase Savings', balance: 5278 },
      { id: 4, name: 'Car', balance: 2271 },
      { id: 5, name: 'Mortgage fund', balance: 2209 },
      { id: 6, name: 'General', balance: 1273 },
      { id: 7, name: 'House', balance: 0 },
    ],
    isDebt: false
  },
  {
    type: 'Investment',
    icon: <TrendingUpIcon size={20} className="text-warning" />,
    accounts: [
      { id: 8, name: 'Tenable Inc. 401(k) Plan', balance: 188265 },
      { id: 9, name: 'Self-Directed', balance: 30252 },
      { id: 10, name: 'Joint_tenants_wros', balance: 15516 },
      { id: 11, name: 'Rollover IRA', balance: 13042 },
      { id: 12, name: 'Roth Ira', balance: 7360 },
      { id: 13, name: 'Individual - TOD', balance: 60 },
    ],
    isDebt: false
  },
  {
    type: 'Loan',
    icon: <BriefcaseIcon size={20} className="text-danger" />,
    accounts: [
      { id: 14, name: 'Mortgage', balance: 524349 },
    ],
    isDebt: true
  },
  {
    type: 'Real estate',
    icon: <HomeIcon size={20} className="text-secondary" />,
    accounts: [
      { id: 15, name: 'Single Family', balance: 647800 },
    ],
    isDebt: false
  },
  {
    type: 'Other',
    icon: <BriefcaseIcon size={20} className="text-default-500" />,
    accounts: [
      { id: 16, name: 'Manual account', balance: 0 },
    ],
    isDebt: false
  }
];

function Accounts() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold">Accounts</h1>
        <Button variant="primary">
          <PlusIcon size={18} />
          Add Account
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        {accountGroups.map(group => {
          const totalBalance = group.accounts.reduce((sum, acc) => sum + acc.balance, 0);
          
          return (
            <Card key={group.type} className="w-full">
              <CardHeader className="flex justify-between items-center px-6 pt-5 pb-3">
                <div className="flex items-center gap-3">
                  {group.icon}
                  <h4 className="font-semibold text-lg">{group.type}</h4>
                </div>
                <div className={`font-semibold text-lg ${group.isDebt ? 'text-danger' : 'text-success'}`}>
                  ${totalBalance.toLocaleString()}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="px-0 py-0">
                <div className="flex flex-col divide-y divide-divider">
                  {group.accounts.map(acc => (
                    <div key={acc.id} className="flex justify-between items-center px-6 py-4 hover:bg-default-50 transition-colors cursor-pointer group">
                      <span className="font-medium text-default-700 group-hover:text-primary transition-colors">
                        {acc.name}
                      </span>
                      <span className="font-medium">
                        ${acc.balance.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  )
}

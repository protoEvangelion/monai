import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { 
  Card, 
  CardHeader, 
  CardContent, 
  ProgressBar,
  Button,
  ButtonGroup
} from "@heroui/react";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { ChevronRightIcon, CheckCircleIcon, TagIcon } from 'lucide-react';

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated) {
    throw redirect({
      to: '/sign-in/$',
    })
  }

  return { userId }
})

export const Route = createFileRoute('/')({
  component: Dashboard,
  beforeLoad: async () => await authStateFn(),
})

// Mock data
const netWorthData = [
  { month: 'Jan', assets: 850000, debts: 550000 },
  { month: 'Feb', assets: 870000, debts: 545000 },
  { month: 'Mar', assets: 890000, debts: 540000 },
  { month: 'Apr', assets: 913326, debts: 526917 },
];

const topCategories = [
  { name: 'Household', spent: 2136, budgeted: 6428, txCount: 9, icon: '🏠', color: 'accent', iconBg: 'bg-primary/15 ring-1 ring-primary/20' },
  { name: 'Food', spent: 1160, budgeted: 1400, txCount: 2, icon: '🍔', color: 'accent', iconBg: 'bg-secondary/15 ring-1 ring-secondary/20' },
  { name: 'Giving', spent: 592, budgeted: 1050, txCount: 2, icon: '🎁', color: 'success', iconBg: 'bg-success/15 ring-1 ring-success/20' },
  { name: 'Auto', spent: 421, budgeted: 650, txCount: 2, icon: '🚗', color: 'warning', iconBg: 'bg-warning/15 ring-1 ring-warning/20' },
  { name: 'Fun', spent: 320, budgeted: 450, txCount: 3, icon: '🎉', color: 'danger', iconBg: 'bg-danger/15 ring-1 ring-danger/20' },
];

const reviewTransactions = [
  { id: 1, merchant: 'Venmo', amount: 150.00, icon: '🤷‍♂️', category: 'Other', date: 'Yesterday' },
  { id: 2, merchant: 'Kroger', amount: 38.42, icon: '💊', category: 'Drugs', date: 'Yesterday' },
  { id: 3, merchant: 'Grace Bible Church', amount: 5.00, icon: '🤷‍♂️', category: 'Other', date: 'Yesterday' },
  { id: 4, merchant: 'Scooters Coffee', amount: 12.88, icon: '🍔', category: 'Restaurants', date: 'Saturday, April 18' },
];

function Dashboard() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
      
      {/* Left Column (Main Content) */}
      <div className="xl:col-span-2 flex flex-col gap-6">
        
        {/* Monthly Spending */}
        <Card className="bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5">
          <CardHeader className="flex justify-between items-center px-6 pt-6 pb-2">
            <h5 className="font-bold text-lg">Monthly spending</h5>
            <Button variant="ghost" className="h-8 px-2 text-xs">
              Transactions
              <ChevronRightIcon size={16} className="ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-5xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent leading-tight">$5,975</div>
                  <div className="text-default-500 text-sm mt-1">left this month</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-default-700">$11,223</div>
                  <div className="text-default-500 text-sm">budgeted</div>
                </div>
              </div>
              
              <ProgressBar value={(11223 - 5975) / 11223 * 100} color="accent" className="h-3" />
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-success font-medium">Currently $2,234 under budget</span>
                <span className="text-default-400">0 days left</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions to Review */}
        <Card className="bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5">
          <CardHeader className="flex justify-between items-center px-6 pt-6 pb-2">
            <h5 className="font-bold text-lg">Transactions to review</h5>
            <Button variant="ghost" className="h-8 px-2 text-xs">
              View all
              <ChevronRightIcon size={16} className="ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6 p-0">
            <div className="flex flex-col divide-y divide-divider">
              {reviewTransactions.map(tx => (
                <div key={tx.id} className="py-4 hover:bg-default-100 transition-colors px-6 cursor-pointer group flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-default-400 font-medium mb-1">{tx.date}</span>
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
                  <div className="font-semibold text-lg text-default-800">
                    ${tx.amount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="px-6 mt-4 flex justify-between items-center">
              <span className="text-sm text-default-500">1 - 4 of 4</span>
              <Button variant="secondary">
                <CheckCircleIcon size={16} className="mr-2" />
                Mark 4 as reviewed
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Right Column (Sidebar Widgets) */}
      <div className="flex flex-col gap-6">
        
        {/* Net Worth */}
        <Card className="bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5">
          <CardHeader className="flex justify-between items-center px-6 pt-6 pb-2">
            <h5 className="font-bold text-lg">Net worth</h5>
            <Button variant="ghost" className="h-8 px-2 text-xs">
              Accounts
              <ChevronRightIcon size={16} className="ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="flex justify-between mb-6">
              <div>
                <div className="text-xs text-default-400 font-semibold uppercase tracking-wider mb-1">Assets</div>
                <div className="text-2xl font-black text-success">$913,326</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-default-400 font-semibold uppercase tracking-wider mb-1">Debts</div>
                <div className="text-2xl font-black text-danger">$526,917</div>
              </div>
            </div>
            
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netWorthData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Tooltip />
                  <Area type="monotone" dataKey="assets" stroke="#17c964" fill="#17c964" fillOpacity={0.2} strokeWidth={2} />
                  <Area type="monotone" dataKey="debts" stroke="#f31260" fill="#f31260" fillOpacity={0.2} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex justify-center mt-4">
              <ButtonGroup variant="secondary">
                <Button className="px-2 text-xs h-7">1W</Button>
                <Button className="px-2 text-xs h-7">1M</Button>
                <Button className="px-2 text-xs h-7">3M</Button>
                <Button variant="primary" className="px-2 text-xs h-7">YTD</Button>
                <Button className="px-2 text-xs h-7">1Y</Button>
                <Button className="px-2 text-xs h-7">ALL</Button>
              </ButtonGroup>
            </div>
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card className="bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5">
          <CardHeader className="flex justify-between items-center px-6 pt-6 pb-2">
            <h5 className="font-bold text-lg">Top categories</h5>
            <Button variant="ghost" className="h-8 px-2 text-xs">
              View all
              <ChevronRightIcon size={16} className="ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="flex flex-col gap-5">
              {topCategories.map(cat => (
                <div key={cat.name} className="flex flex-col gap-2 group cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${cat.iconBg}`}>
                        {cat.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{cat.name}</span>
                        <span className="text-xs text-default-400">{cat.txCount} transactions</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-sm">${cat.spent.toLocaleString()}</span>
                      <span className="text-xs text-default-400">of ${cat.budgeted.toLocaleString()}</span>
                    </div>
                  </div>
                  <ProgressBar 
                    value={(cat.spent / cat.budgeted) * 100} 
                    color={cat.color as any} 
                    className="h-1.5 opacity-80 group-hover:opacity-100 transition-opacity" 
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Next Two Weeks */}
        <Card className="bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5">
          <CardHeader className="flex justify-between items-center px-6 pt-6 pb-2">
            <h5 className="font-bold text-lg">Next two weeks</h5>
            <Button variant="ghost" className="h-8 px-2 text-xs">
              Recurrings
              <ChevronRightIcon size={16} className="ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-4 text-center">
            <p className="text-default-500 font-medium">There are no upcoming payments</p>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAuthOrDevAuth } from '../lib/devAuth'
import { Card, CardHeader, CardContent, Separator, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover } from '@heroui/react'
import { 
  CreditCardIcon, 
  LandmarkIcon, 
  TrendingUpIcon, 
  HomeIcon, 
  BriefcaseIcon, 
  PlusIcon, 
  Loader2Icon,
  Trash2Icon,
  MoreVerticalIcon,
  AlertTriangleIcon
} from 'lucide-react'
import { usePlaidLink } from 'react-plaid-link'
import { useState, useEffect } from 'react'
import { createLinkToken, exchangePublicToken, removeItem, deleteAccount } from '../server/plaid'
import { getAccounts } from '../server/accounts'
import { formatCurrency } from '../lib/format'

const authStateFn = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await getAuthOrDevAuth()
  if (!isAuthenticated) throw redirect({ to: '/sign-in/$' })
  return { userId }
})

export const Route = createFileRoute('/accounts')({
  component: Accounts,
  beforeLoad: async () => await authStateFn(),
  loader: () => getAccounts(),
})

const typeConfig: Record<string, { label: string; icon: React.ReactNode; isDebt: boolean }> = {
  cash:        { label: 'Depository',  icon: <LandmarkIcon size={20} className="text-success" />,  isDebt: false },
  credit:      { label: 'Credit Card', icon: <CreditCardIcon size={20} className="text-primary" />, isDebt: true  },
  investment:  { label: 'Investment',  icon: <TrendingUpIcon size={20} className="text-warning" />, isDebt: false },
  loan:        { label: 'Loan',        icon: <BriefcaseIcon size={20} className="text-danger" />,   isDebt: true  },
  real_estate: { label: 'Real Estate', icon: <HomeIcon size={20} className="text-secondary" />,     isDebt: false },
}

function AddAccountButton({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { open, ready } = usePlaidLink({
    token: token ?? '',
    onSuccess: async (publicToken) => {
      setLoading(true)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (exchangePublicToken as any)({ data: { publicToken } })
        onSuccess()
      } finally {
        setLoading(false)
        setToken(null)
      }
    },
    onExit: () => {
      setToken(null)
      setLoading(false)
    },
  })

  useEffect(() => {
    if (token && ready) open()
  }, [token, ready, open])

  const handleClick = async () => {
    setLoading(true)
    const linkToken = await createLinkToken()
    setToken(linkToken)
  }

  return (
    <Button variant="primary" onPress={handleClick} isDisabled={loading}>
      {loading ? <Loader2Icon size={18} className="animate-spin" /> : <PlusIcon size={18} />}
      {loading ? 'Connecting...' : 'Add Account'}
    </Button>
  )
}

function Accounts() {
  const router = useRouter()
  const allAccounts = Route.useLoaderData()
  const [isDeleting, setIsDeleting] = useState<number | null>(null)

  const grouped = Object.entries(typeConfig).reduce<
    Record<string, { config: (typeof typeConfig)[string]; accounts: typeof allAccounts }>
  >((acc, [type, config]) => {
    const matching = allAccounts.filter(a => a.type === type)
    if (matching.length > 0) acc[type] = { config, accounts: matching }
    return acc
  }, {})

  const handleDeleteAccount = async (id: number) => {
    if (!confirm('Are you sure you want to remove this account? Transactions will be preserved if they belong to other active accounts.')) return
    setIsDeleting(id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (deleteAccount as any)({ data: { id } })
      router.invalidate()
    } finally {
      setIsDeleting(null)
    }
  }

  const handleDisconnectBank = async (plaidItemId: number | null) => {
    if (!plaidItemId) return
    if (!confirm('Disconnect this bank? ALL associated accounts and transactions will be permanently deleted.')) return
    
    setIsDeleting(plaidItemId)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (removeItem as any)({ data: { id: plaidItemId } })
      router.invalidate()
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
        <AddAccountButton onSuccess={() => router.invalidate()} />
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card className="w-full bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5 border-divider/50">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center">
              <LandmarkIcon size={32} className="text-default-400" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-lg">No accounts linked</p>
              <p className="text-sm text-default-400 max-w-xs">Connect your bank via Plaid to securely import your transactions and balances.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {Object.entries(grouped).map(([type, { config, accounts: accs }]) => {
            const total = accs.reduce((sum, a) => sum + a.currentBalance, 0)
            return (
              <Card key={type} className="w-full bg-background/60 backdrop-blur-md shadow-2xl shadow-black/5 border-divider/50 overflow-hidden">
                <CardHeader className="flex justify-between items-center px-6 pt-5 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-default-100/50">
                      {config.icon}
                    </div>
                    <h4 className="font-bold text-lg tracking-tight">{config.label}</h4>
                  </div>
                  <div className={`font-bold text-xl tracking-tight ${config.isDebt ? 'text-danger' : 'text-success'}`}>
                    {formatCurrency(total)}
                  </div>
                </CardHeader>
                <Separator className="opacity-50" />
                <CardContent className="px-0 py-0">
                  <div className="flex flex-col divide-y divide-divider/50">
                    {accs.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center px-6 py-5 hover:bg-default-50/50 transition-all cursor-pointer group relative">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-default-800 group-hover:text-primary transition-colors">
                            {acc.name}
                          </span>
                          <span className="text-xs text-default-400 uppercase font-bold tracking-wider">
                            {acc.type}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-default-700">
                            {formatCurrency(acc.currentBalance)}
                          </span>
                          
                          <Dropdown>
                            <DropdownTrigger>
                              <div
                                role="button"
                                tabIndex={0}
                                className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full h-8 w-8 hover:bg-default-100 cursor-pointer text-default-400"
                              >
                                <MoreVerticalIcon size={16} />
                              </div>
                            </DropdownTrigger>
                            <DropdownPopover>
                              <DropdownMenu aria-label="Account actions">
                                <DropdownItem 
                                  key="delete" 
                                  className="text-danger" 
                                  onAction={() => handleDeleteAccount(acc.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    <Trash2Icon size={16} />
                                    <span>Remove Account</span>
                                  </div>
                                </DropdownItem>
                                {acc.plaidItemId && (
                                  <DropdownItem 
                                    key="disconnect" 
                                    className="text-danger" 
                                    onAction={() => handleDisconnectBank(acc.plaidItemId)}
                                  >
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-2 text-danger">
                                        <AlertTriangleIcon size={16} />
                                        <span>Disconnect Institution</span>
                                      </div>
                                      <span className="text-tiny text-default-400">Permanently delete all data</span>
                                    </div>
                                  </DropdownItem>
                                )}
                              </DropdownMenu>
                            </DropdownPopover>
                          </Dropdown>
                        </div>

                        {isDeleting === acc.id && (
                          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                            <Loader2Icon size={20} className="animate-spin text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

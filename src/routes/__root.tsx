import { ClerkProvider } from '@clerk/tanstack-react-start'
import { HeadContent, Scripts, createRootRoute, Link, useLocation } from '@tanstack/react-router'
import {
  Button,
  Card,
  CardContent,
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
  ScrollShadow,
  Separator
} from "@heroui/react";
import {
  CalendarIcon,
  ChevronDownIcon,
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  WalletIcon,
  PieChartIcon,
  RepeatIcon,
  SettingsIcon,
  HelpCircleIcon,
  SunIcon,
  MoonIcon,
  CheckIcon,
  CreditCardIcon,
  LandmarkIcon,
  TrendingUpIcon
} from "lucide-react";
import HeaderUser from '../integrations/clerk/header-user'
import { useTimeTravel } from '../store/useTimeTravel';
import { useTheme, type ThemePalette } from '../store/useTheme';
import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../lib/format';
import { getAccounts } from '../server/accounts';
import { autoSync } from '../server/plaid';

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Monai - Financial Dashboard' },
      { name: 'theme-color', content: '#6366f1' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
  loader: async () => {
    // Fire-and-forget auto-sync: runs server-side, no-ops if last sync was <24h ago
    autoSync().catch((e) => console.error('Auto-sync error:', e))
  },
})

type SidebarAccount = {
  type: string
  group: string
  balance: number
}

const sidebarTypeLabels: Record<string, string> = {
  credit: 'Credit card',
  cash: 'Depository',
  investment: 'Investment',
  loan: 'Loan',
  real_estate: 'Real Estate',
}

function getSidebarIcon(type: string) {
  if (type === 'credit') return <CreditCardIcon size={16} className="text-primary" />
  if (type === 'cash') return <LandmarkIcon size={16} className="text-success" />
  if (type === 'investment') return <TrendingUpIcon size={16} className="text-warning" />
  if (type === 'loan') return <WalletIcon size={16} className="text-danger" />
  return <PieChartIcon size={16} className="text-default-400" />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { viewDate, setViewDate } = useTimeTravel();
  const { theme, toggleTheme, setPalette } = useTheme();
  const isDarkTheme = theme.endsWith('-dark')
  const currentPalette = (theme.replace('-dark', '') as ThemePalette)
  const paletteLabel = currentPalette[0].toUpperCase() + currentPalette.slice(1)
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const [sidebarAccounts, setSidebarAccounts] = useState<SidebarAccount[]>([])
  const monthInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentViewDate = new Date(viewDate);
  const monthName = currentViewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const pageTitle =
    location.pathname === '/' ? 'Dashboard'
    : location.pathname.startsWith('/transactions') ? 'Transactions'
    : location.pathname.startsWith('/accounts') ? 'Accounts'
    : location.pathname.startsWith('/categories') ? 'Categories'
    : 'Overview'

  const isAuthPage = location.pathname.startsWith('/sign-in');

  useEffect(() => {
    if (isAuthPage) return

    let active = true

    const loadSidebarAccounts = async () => {
      try {
        const accounts = await getAccounts()
        const grouped = accounts.reduce<Record<string, number>>((acc, account) => {
          const type = account.type ?? 'other'
          acc[type] = (acc[type] ?? 0) + Number(account.currentBalance ?? 0)
          return acc
        }, {})

        const next = Object.entries(grouped)
          .map(([type, balance]) => ({
            type,
            group: sidebarTypeLabels[type] ?? type,
            balance,
          }))
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))

        if (active) setSidebarAccounts(next)
      } catch {
        if (active) setSidebarAccounts([])
      }
    }

    void loadSidebarAccounts()

    return () => {
      active = false
    }
  }, [isAuthPage, location.pathname])

  const monthInputValue = `${currentViewDate.getFullYear()}-${String(currentViewDate.getMonth() + 1).padStart(2, '0')}`

  const openMonthPicker = () => {
    const input = monthInputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
    input.focus()
    input.click()
  }

  return (
    <html lang="en" className={isDarkTheme ? 'dark' : 'light'} data-theme={theme}>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased selection:bg-primary/30">
        <ClerkProvider>
          <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
            
            {/* Radial Lens Flare Background */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              {/* Purple top-left */}
              <div className="orb-1 absolute top-[-25%] left-[-18%] w-[60%] h-[60%] rounded-full blur-[140px]" style={{ background: 'rgba(139,92,246,0.35)' }} />
              {/* Teal bottom-right */}
              <div className="orb-2 absolute bottom-[-25%] right-[-18%] w-[60%] h-[60%] rounded-full blur-[140px]" style={{ background: 'rgba(20,184,166,0.35)' }} />

              <div className="absolute top-[45%] left-[42%] w-[18%] h-[18%] rounded-full bg-primary/10 blur-[70px]" />
            </div>

            {mounted ? (
              isAuthPage ? (
                /* Centered Login Layout */
                <div className="grow flex items-center justify-center z-10 p-4">
                  <div className="w-full max-w-md">
                    <div className="flex flex-col items-center gap-6 mb-8 text-center">
                      <div className="font-black text-5xl tracking-tighter bg-linear-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-gradient-x">MONAI</div>
                      <p className="text-default-500 font-medium text-lg">Your premium, local-first financial command center.</p>
                    </div>
                    <div className="bg-background/60 backdrop-blur-2xl p-8 rounded-3xl border border-divider/50 shadow-2xl">
                      {children}
                    </div>
                  </div>
                </div>
              ) : (
                /* Main App Layout */
                <>
                  {/* Sidebar */}
                  <aside className="hidden lg:flex w-72 border-r border-divider/60 flex-col bg-content1/70 backdrop-blur-2xl z-10">
                    <div className="px-5 pb-5 pt-3 flex flex-col gap-4 h-full">
                      
                      {/* Logo + User */}
                      <div className="flex items-center justify-between">
                        <Link to="/" className="flex items-center gap-2.5 hover:opacity-85 transition-opacity">
                          <img src="/favicon.svg" alt="Monai" className="h-8 w-8" />
                          <span className="font-black text-xl tracking-tight text-foreground">MONAI</span>
                        </Link>
                        <HeaderUser />
                      </div>

                      <Card className="bg-content2/65 border border-divider/50 shadow-none">
                        <CardContent className="p-2">
                          <nav className="flex flex-col gap-1">
                            <SidebarLink to="/" icon={<LayoutDashboardIcon size={18} />} label="Dashboard" />
                            <SidebarLink to="/transactions" icon={<ArrowLeftRightIcon size={18} />} label="Transactions" />
                            <SidebarLink to="/accounts" icon={<WalletIcon size={18} />} label="Accounts" />
                            <SidebarLink to="/categories" icon={<PieChartIcon size={18} />} label="Categories" />
                            <SidebarStaticItem icon={<RepeatIcon size={18} />} label="Recurrings" />
                          </nav>
                        </CardContent>
                      </Card>

                      {/* Account Summary */}
                      <Card className="bg-content2/65 border border-divider/50 shadow-none">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-tiny uppercase font-bold text-default-400">Net Worth</p>
                            <Chip size="sm" variant="soft">{sidebarAccounts.length}</Chip>
                          </div>
                          <ScrollShadow className="max-h-56 pr-1">
                            {sidebarAccounts.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {sidebarAccounts.map(acc => (
                                  <div key={acc.type} className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-content1 transition-colors group cursor-pointer">
                                    <div className="flex items-center gap-2.5">
                                      {getSidebarIcon(acc.type)}
                                      <span className="text-sm font-medium text-default-600 group-hover:text-foreground">{acc.group}</span>
                                    </div>
                                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(acc.balance, { maximumFractionDigits: 0 })}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="px-2.5 py-2 text-sm text-default-400">No accounts linked</div>
                            )}
                          </ScrollShadow>
                        </CardContent>
                      </Card>

                      {/* Bottom Actions */}
                      <div className="mt-auto flex flex-col gap-3">
                        <Separator className="bg-divider/50" />
                        <div className="flex flex-col gap-1 px-1">
                          <SidebarStaticItem icon={<SettingsIcon size={18} />} label="Settings" />
                          <SidebarStaticItem icon={<HelpCircleIcon size={18} />} label="Get Help" />
                        </div>
                        <div className="h-1" />
                      </div>
                    </div>
                  </aside>

                  {/* Main Content Area */}
                  <div className="grow flex flex-col overflow-hidden z-10">
                    
                    {/* Top Header */}
                    <header className="h-16 border-b border-divider/70 flex items-center justify-between px-8 bg-content1/70 backdrop-blur-xl sticky top-0 z-40">
                      <div className="flex items-center gap-4">
                        <Chip variant="soft" className="font-semibold">{pageTitle}</Chip>
                        <input
                          ref={monthInputRef}
                          type="month"
                          value={monthInputValue}
                          onChange={(event) => {
                            const value = event.target.value
                            if (!value) return
                            const nextDate = new Date(`${value}-01T00:00:00`)
                            setViewDate(nextDate.toISOString())
                          }}
                          className="sr-only"
                          aria-label="Choose month"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-4 font-semibold rounded-full bg-content2 hover:bg-content2/80"
                          onPress={openMonthPicker}
                        >
                          <CalendarIcon size={16} />
                          {monthName}
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Dropdown>
                          <DropdownTrigger className="flex items-center gap-1 cursor-pointer text-sm rounded-full px-3 py-1 hover:bg-white/10 transition-colors">
                            {paletteLabel}
                            <ChevronDownIcon size={14} />
                          </DropdownTrigger>
                          <DropdownPopover>
                            <DropdownMenu aria-label="Theme palette">
                              <DropdownItem key="ocean" onAction={() => setPalette('ocean')}>
                                <div className="flex items-center justify-between gap-3 w-full">
                                  <span>Ocean</span>
                                  {currentPalette === 'ocean' && <CheckIcon size={14} />}
                                </div>
                              </DropdownItem>
                              <DropdownItem key="graphite" onAction={() => setPalette('graphite')}>
                                <div className="flex items-center justify-between gap-3 w-full">
                                  <span>Graphite</span>
                                  {currentPalette === 'graphite' && <CheckIcon size={14} />}
                                </div>
                              </DropdownItem>
                              <DropdownItem key="sunset" onAction={() => setPalette('sunset')}>
                                <div className="flex items-center justify-between gap-3 w-full">
                                  <span>Sunset</span>
                                  {currentPalette === 'sunset' && <CheckIcon size={14} />}
                                </div>
                              </DropdownItem>
                            </DropdownMenu>
                          </DropdownPopover>
                        </Dropdown>
                        <Button
                          variant="ghost"
                          isIconOnly
                          size="sm"
                          onPress={toggleTheme}
                          className="rounded-full"
                        >
                          {isDarkTheme ? <SunIcon size={17} /> : <MoonIcon size={17} />}
                        </Button>
                      </div>
                    </header>

                    {/* Page Content */}
                    <main className="grow overflow-y-auto p-6 xl:p-8 bg-transparent">
                      <div className="mx-auto w-full">
                        {children}
                      </div>
                    </main>
                  </div>
                </>
              )
            ) : null}
          </div>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}

function SidebarLink({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-primary/15 text-primary font-semibold" }}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-default-600 hover:bg-content1 hover:text-foreground transition-all group"
    >
      <span className="group-hover:scale-105 transition-transform">
        {icon}
      </span>
      <span className="text-sm">{label}</span>
    </Link>
  )
}

function SidebarStaticItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-default-500/90">
      <span>{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

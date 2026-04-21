import { ClerkProvider } from '@clerk/tanstack-react-start'
import { HeadContent, Scripts, createRootRoute, Link } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { 
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
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
  CreditCardIcon,
  LandmarkIcon,
  TrendingUpIcon,
  RefreshCwIcon,
  SunIcon,
  MoonIcon
} from "lucide-react";
import HeaderUser from '../integrations/clerk/header-user'
import { useTimeTravel } from '../store/useTimeTravel';
import { useTheme } from '../store/useTheme';

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Monai - Financial Dashboard' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

const sidebarAccounts = [
  { group: 'Credit card', balance: 2568, icon: <CreditCardIcon size={16} className="text-primary" /> },
  { group: 'Depository', balance: 11031, icon: <LandmarkIcon size={16} className="text-success" /> },
  { group: 'Investment', balance: 254495, icon: <TrendingUpIcon size={16} className="text-warning" /> },
];

function RootDocument({ children }: { children: React.ReactNode }) {
  const { viewDate, setViewDate, resetToCurrentMonth } = useTimeTravel();
  const { theme, toggleTheme } = useTheme();
  
  const currentViewDate = new Date(viewDate);
  const monthName = currentViewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <html lang="en" className={theme}>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased selection:bg-primary/30">
        <ClerkProvider>
          <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
            
            {/* Radial Lens Flare Background */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              <div className="orb-1 absolute top-[-25%] left-[-18%] w-[60%] h-[60%] rounded-full bg-primary/25 blur-[140px]" />
              <div className="orb-2 absolute bottom-[-25%] right-[-18%] w-[60%] h-[60%] rounded-full bg-secondary/25 blur-[140px]" />
              <div className="orb-3 absolute top-[5%] right-[0%] w-[38%] h-[38%] rounded-full bg-warning/15 blur-[110px]" />
              <div className="orb-4 absolute bottom-[10%] left-[15%] w-[28%] h-[28%] rounded-full bg-success/12 blur-[90px]" />
              <div className="absolute top-[45%] left-[42%] w-[18%] h-[18%] rounded-full bg-primary/10 blur-[70px]" />
            </div>

            {/* Sidebar */}
            <aside className="w-64 border-r border-primary/10 flex flex-col bg-background/40 backdrop-blur-2xl z-10 shadow-[2px_0_40px_rgba(0,0,0,0.06)]">
              <div className="p-6 flex flex-col gap-8 h-full">
                
                {/* Logo & Refresh */}
                <div className="flex items-center justify-between">
                  <Link to="/" className="font-black text-2xl tracking-tighter hover:opacity-80 transition-opacity bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent bg-[length:200%] hover:bg-right">MONAI</Link>
                  <Button variant="ghost" isIconOnly size="sm">
                    <RefreshCwIcon size={16} className="text-default-400" />
                  </Button>
                </div>

                {/* Primary Navigation */}
                <nav className="flex flex-col gap-1">
                  <SidebarLink to="/" icon={<LayoutDashboardIcon size={20} />} label="Dashboard" />
                  <SidebarLink to="/transactions" icon={<ArrowLeftRightIcon size={20} />} label="Transactions" />
                  <SidebarLink to="/accounts" icon={<WalletIcon size={20} />} label="Accounts" />
                  <SidebarLink to="/categories" icon={<PieChartIcon size={20} />} label="Categories" />
                  <SidebarLink to="/" icon={<RepeatIcon size={20} />} label="Recurrings" />
                </nav>

                {/* Account Summary */}
                <div className="flex flex-col gap-4 mt-4 overflow-y-auto pr-2 custom-scrollbar">
                  <p className="text-tiny uppercase font-bold text-default-400 px-3">Net Worth</p>
                  <div className="flex flex-col gap-1">
                    {sidebarAccounts.map(acc => (
                      <div key={acc.group} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-default-100 cursor-pointer transition-colors group">
                        <div className="flex items-center gap-3">
                          {acc.icon}
                          <span className="text-sm font-medium text-default-600 group-hover:text-foreground">{acc.group}</span>
                        </div>
                        <span className="text-sm font-semibold">${acc.balance.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-auto flex flex-col gap-4">
                  <Separator className="bg-divider/50" />
                  <div className="flex flex-col gap-1">
                    <SidebarLink to="/" icon={<SettingsIcon size={20} />} label="Settings" />
                    <SidebarLink to="/" icon={<HelpCircleIcon size={20} />} label="Get Help" />
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <HeaderUser />
                    <Button 
                      variant="ghost" 
                      isIconOnly 
                      size="sm" 
                      onClick={toggleTheme}
                      className="rounded-full"
                    >
                      {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
                    </Button>
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-grow flex flex-col overflow-hidden z-10">
              
              {/* Top Header */}
              <header className="h-16 border-b border-divider flex items-center justify-between px-8 bg-background/40 backdrop-blur-md sticky top-0 z-40">
                <div className="flex items-center gap-4">
                   <Dropdown>
                    <DropdownTrigger>
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex items-center gap-2 bg-background/50 backdrop-blur-sm text-foreground px-4 py-2 rounded-full text-sm font-semibold cursor-pointer border border-primary/25 hover:border-primary/50 hover:bg-primary/5 transition-all shadow-sm hover:shadow-md hover:shadow-primary/10"
                      >
                        <CalendarIcon size={16} />
                        {monthName}
                        <ChevronDownIcon size={16} />
                      </div>
                    </DropdownTrigger>
                    <DropdownPopover>
                      <DropdownMenu aria-label="Time Travel">
                        <DropdownItem key="current" onAction={() => resetToCurrentMonth()}>Current Month</DropdownItem>
                        <DropdownItem key="prev" onAction={() => {
                          const prev = new Date(currentViewDate);
                          prev.setMonth(prev.getMonth() - 1);
                          setViewDate(prev.toISOString());
                        }}>Previous Month</DropdownItem>
                        <DropdownItem key="next" onAction={() => {
                          const next = new Date(currentViewDate);
                          next.setMonth(next.getMonth() + 1);
                          setViewDate(next.toISOString());
                        }}>Next Month</DropdownItem>
                      </DropdownMenu>
                    </DropdownPopover>
                  </Dropdown>
                </div>
                
                <div className="flex items-center gap-4">
                  <Button size="sm" className="rounded-full font-bold px-6 h-9 bg-gradient-to-r from-primary to-secondary text-white border-none shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-105 hover:opacity-95 transition-all">
                    + New
                  </Button>
                </div>
              </header>

              {/* Page Content */}
              <main className="flex-grow overflow-y-auto p-8 bg-transparent">
                <div className="container mx-auto">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </ClerkProvider>
        <TanStackRouterDevtools />
        <Scripts />
      </body>
    </html>
  )
}

function SidebarLink({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-gradient-to-r from-primary/20 to-secondary/10 text-primary font-bold shadow-md ring-1 ring-primary/30 shadow-primary/10" }}
      className="flex items-center gap-4 px-3 py-2.5 rounded-xl text-default-500 hover:bg-default-100/70 hover:text-foreground transition-all group"
    >
      <span className="group-hover:scale-110 transition-transform">
        {icon}
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  )
}

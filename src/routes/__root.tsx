import { ClerkProvider } from "@clerk/tanstack-react-start";
import {
  HeadContent,
  Scripts,
  createRootRoute,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTheme } from "../ui/hooks/useTheme";
import { AppHeader } from "../ui/layout/AppHeader";
import { AppSidebar, type SidebarAccount } from "../ui/layout/AppSidebar";
import { getAccounts } from "../server/accounts.fns";
import { autoSync } from "../server/plaid.sync.fns";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Monai - Financial Dashboard" },
      { name: "theme-color", content: "#6366f1" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootDocument,
  loader: async () => {
    autoSync().catch((error) => console.error("Auto-sync error:", error));
  },
});

const sidebarTypeLabels: Record<string, string> = {
  credit: "Credit card",
  cash: "Depository",
  investment: "Investment",
  loan: "Loan",
  real_estate: "Real Estate",
};

function RootDocument({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const isDarkTheme = theme.endsWith("-dark");
  const location = useLocation();
  const isAuthPage = location.pathname.startsWith("/sign-in");

  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarAccounts, setSidebarAccounts] = useState<SidebarAccount[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isAuthPage) return;

    let active = true;

    const loadSidebarAccounts = async () => {
      try {
        const accounts = await getAccounts();
        const grouped = accounts.reduce<Record<string, number>>(
          (acc, account) => {
            const type = account.type ?? "other";
            acc[type] = (acc[type] ?? 0) + Number(account.currentBalance ?? 0);
            return acc;
          },
          {},
        );

        const next = Object.entries(grouped)
          .map(([type, balance]) => ({
            type,
            group: sidebarTypeLabels[type] ?? type,
            balance,
          }))
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

        if (active) setSidebarAccounts(next);
      } catch {
        if (active) setSidebarAccounts([]);
      }
    };

    void loadSidebarAccounts();

    return () => {
      active = false;
    };
  }, [isAuthPage, location.pathname]);

  return (
    <html
      lang="en"
      className={isDarkTheme ? "dark" : "light"}
      data-theme={theme}
    >
      <head>
        <HeadContent />
      </head>
      <body className="antialiased selection:bg-primary/30">
        <ClerkProvider>
          <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
            {mounted ? (
              isAuthPage ? (
                <div className="z-10 flex grow items-center justify-center p-4">
                  <div className="w-full max-w-md">
                    <div className="mb-8 flex flex-col items-center gap-6 text-center">
                      <div className="animate-gradient-x bg-linear-to-r from-primary via-secondary to-primary bg-clip-text text-5xl font-black tracking-tighter text-transparent">
                        MONAI
                      </div>
                      <p className="text-default-500 text-lg font-medium">
                        Your premium, local-first financial command center.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-divider/50 bg-background p-8 shadow-2xl">
                      {children}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <aside className="z-10 hidden w-64 flex-col border-r border-divider/60 bg-background xl:flex">
                    <AppSidebar sidebarAccounts={sidebarAccounts} />
                  </aside>

                  {sidebarOpen ? (
                    <div className="fixed inset-0 z-50 xl:hidden">
                      <button
                        type="button"
                        aria-label="Close sidebar"
                        className="absolute inset-0 bg-black/45"
                        onClick={() => setSidebarOpen(false)}
                      />
                      <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-divider/60 bg-background shadow-2xl">
                        <AppSidebar
                          sidebarAccounts={sidebarAccounts}
                          onClose={() => setSidebarOpen(false)}
                        />
                      </aside>
                    </div>
                  ) : null}

                  <div className="z-10 flex grow flex-col overflow-hidden">
                    <AppHeader
                      pageTitle=""
                      onOpenSidebar={() => setSidebarOpen(true)}
                    />

                    <main className="grow overflow-y-auto bg-transparent p-6 xl:p-8">
                      <div className="mx-auto w-full">{children}</div>
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
  );
}

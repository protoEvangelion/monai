import { Button } from "@heroui/react";
import { SunIcon, MoonIcon, MenuIcon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTransition } from "react";
import { useTheme } from "../hooks/useTheme";
import { useTimeTravel } from "../hooks/useTimeTravel";
import { manualSync } from "../../server/plaid.sync.fns";
import { showToast } from "../shared/toast";
import { MonthControls } from "../features/categories/MonthControls";

export function AppHeader({
  pageTitle: _pageTitle,
  onOpenSidebar,
}: {
  pageTitle: string;
  onOpenSidebar: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const { viewDate, setViewDate } = useTimeTravel();
  const router = useRouter();
  const manualSyncFn = useServerFn(manualSync);
  const [isSyncing, startSyncTransition] = useTransition();
  const isDarkTheme = theme === "dark";

  const handleSync = () => {
    startSyncTransition(async () => {
      try {
        await manualSyncFn();
        await router.invalidate();
        showToast({
          title: "Sync complete",
          description: "Fetched the latest Plaid transactions.",
        });
      } catch (error) {
        showToast({
          title: "Sync failed",
          description:
            error instanceof Error ? error.message : "Could not sync transactions.",
          tone: "danger",
        });
      }
    });
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 bg-chrome px-4 xl:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          isIconOnly
          size="sm"
          className="rounded-full xl:hidden"
          aria-label="Open sidebar"
          onPress={onOpenSidebar}
        >
          <MenuIcon size={18} />
        </Button>
      </div>

      <div className="flex shrink-0 justify-center">
        <MonthControls
          compact
          viewDate={viewDate}
          onViewDateChange={setViewDate}
        />
      </div>

      <div className="flex h-full min-w-0 flex-1 items-center justify-end gap-3">
        <Button
          variant="secondary"
          size="sm"
          onPress={handleSync}
          isDisabled={isSyncing}
          className="h-9 shrink-0 rounded-full px-4"
          aria-label="Sync transactions"
        >
          <RefreshCwIcon size={15} className={isSyncing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{isSyncing ? "Syncing" : "Sync"}</span>
        </Button>
        <Button
          variant="ghost"
          isIconOnly
          size="sm"
          onPress={toggleTheme}
          className="h-9 w-9 shrink-0 rounded-full"
          aria-label="Toggle theme"
        >
          {isDarkTheme ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </Button>
      </div>
    </header>
  );
}

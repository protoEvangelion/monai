import { Button, useOverlayState } from "@heroui/react";
import { SunIcon, MoonIcon, MenuIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useTransition } from "react";
import { useTheme } from "../hooks/useTheme";
import { useTimeTravel } from "../hooks/useTimeTravel";
import { manualSync } from "../../server/plaid.sync.fns";
import { showToast } from "../shared/toast";
import { MonthControls } from "../features/categories/MonthControls";
import { AssistantPanel } from "../features/assistant/AssistantPanel";
import { subscribeAssistantRequests } from "../features/assistant/assistantRequest";

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
  const assistant = useOverlayState();
  const openAssistant = assistant.open;

  // A button elsewhere (the dashboard Amazon button) asks for a skill card:
  // open the panel here, and the chat consumes the request on mount.
  useEffect(() => subscribeAssistantRequests(openAssistant), [openAssistant]);

  const handleSync = () => {
    startSyncTransition(async () => {
      try {
        const result = await manualSyncFn();
        await router.invalidate();

        if (result.failures.length === 0) {
          showToast({
            title: "Sync complete",
            description:
              result.total > 1
                ? `Updated ${result.synced} of ${result.total} institutions.`
                : "Fetched the latest Plaid transactions.",
          });
          return;
        }

        const names = result.failures.map((f) => f.institution).join(", ");
        const needsReconnect = result.failures.some((f) => f.status === "reconnect");
        const isConfig = result.failures.some((f) => f.status === "config");

        showToast({
          title:
            result.synced > 0
              ? `Synced ${result.synced} of ${result.total}`
              : "Sync failed",
          description: isConfig
            ? result.failures.find((f) => f.status === "config")?.message
            : needsReconnect
              ? `${names} need${result.failures.length === 1 ? "s" : ""} you to sign in again. Reconnect on the Accounts page.`
              : result.failures[0]?.message ?? "Could not sync transactions.",
          tone: "danger",
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
          onPress={() => assistant.open()}
          className="h-9 shrink-0 rounded-full px-4"
          aria-label="Open assistant"
        >
          <SparklesIcon size={15} />
          <span className="hidden sm:inline">Assistant</span>
        </Button>
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

      <AssistantPanel state={assistant} />
    </header>
  );
}

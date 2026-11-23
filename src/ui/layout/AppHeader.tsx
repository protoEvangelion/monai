import { Button, useOverlayState } from "@heroui/react";
import { SunIcon, MoonIcon, MenuIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useTransition } from "react";
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
  // Toasts are visual only; this mirrors the same status for screen readers.
  const [syncStatus, setSyncStatus] = useState("");
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
        setSyncStatus(
          result.failures.length === 0
            ? `Sync complete. Updated ${result.synced} of ${result.total} institutions.`
            : `Sync finished with ${result.failures.length} problem${result.failures.length === 1 ? "" : "s"}. ${result.failures
                .map((f) => f.institution)
                .join(", ")}.`,
        );

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
        setSyncStatus("Sync failed.");
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
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 bg-chrome px-3 sm:gap-3 sm:px-4 xl:px-8">
      <div className="flex shrink-0 items-center gap-3">
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

      {/*
        Center cluster gets the free space and may shrink; the right cluster is
        `shrink-0`. Before this, both sides were `flex-1` with shrink-0 children,
        so at 390px the month label painted underneath the Assistant button.
      */}
      <div className="flex min-w-0 flex-1 justify-center">
        <MonthControls
          compact
          viewDate={viewDate}
          onViewDateChange={setViewDate}
        />
      </div>

      <div className="flex h-full shrink-0 items-center justify-end gap-2 sm:gap-3">
        <Button
          variant="secondary"
          size="sm"
          onPress={() => assistant.open()}
          className="h-9 shrink-0 rounded-full px-3 sm:px-4"
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
          className="h-9 shrink-0 rounded-full px-3 sm:px-4"
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

      <p aria-live="polite" role="status" className="sr-only">
        {isSyncing ? "Syncing transactions" : syncStatus}
      </p>
      <AssistantPanel state={assistant} />
    </header>
  );
}

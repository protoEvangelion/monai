import {
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
} from "@heroui/react";
import {
  ChevronDownIcon,
  SunIcon,
  MoonIcon,
  CheckIcon,
  MenuIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTransition } from "react";
import { useTheme, type ThemePalette } from "../hooks/useTheme";
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
  const { theme, toggleTheme, setPalette } = useTheme();
  const { viewDate, setViewDate } = useTimeTravel();
  const router = useRouter();
  const manualSyncFn = useServerFn(manualSync);
  const [isSyncing, startSyncTransition] = useTransition();
  const isDarkTheme = theme.endsWith("-dark");
  const currentPalette = theme.replace("-dark", "") as ThemePalette;
  const paletteLabel =
    currentPalette[0].toUpperCase() + currentPalette.slice(1);

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
          description: error instanceof Error ? error.message : "Could not sync transactions.",
          tone: "danger",
        });
      }
    });
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-divider/70 bg-content1/80 px-4 backdrop-blur-xl xl:px-8">
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
        <Dropdown>
          <DropdownTrigger>
            <Button
              variant="secondary"
              size="sm"
              className="inline-flex h-9 shrink-0 rounded-full px-3"
              aria-label="Theme palette"
            >
              {paletteLabel}
              <ChevronDownIcon size={14} />
            </Button>
          </DropdownTrigger>
          <DropdownPopover>
            <DropdownMenu aria-label="Theme palette">
              <DropdownItem key="ocean" onAction={() => setPalette("ocean")}>
                <div className="flex w-full items-center justify-between gap-3">
                  <span>Ocean</span>
                  {currentPalette === "ocean" && <CheckIcon size={14} />}
                </div>
              </DropdownItem>
              <DropdownItem
                key="graphite"
                onAction={() => setPalette("graphite")}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span>Graphite</span>
                  {currentPalette === "graphite" && <CheckIcon size={14} />}
                </div>
              </DropdownItem>
              <DropdownItem key="sunset" onAction={() => setPalette("sunset")}>
                <div className="flex w-full items-center justify-between gap-3">
                  <span>Sunset</span>
                  {currentPalette === "sunset" && <CheckIcon size={14} />}
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
          className="h-9 w-9 shrink-0 rounded-full"
          aria-label="Toggle theme"
        >
          {isDarkTheme ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </Button>
      </div>
    </header>
  );
}

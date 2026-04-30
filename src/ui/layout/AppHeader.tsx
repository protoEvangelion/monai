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
} from "lucide-react";
import { useTheme, type ThemePalette } from "../hooks/useTheme";

export function AppHeader({
  pageTitle: _pageTitle,
  onOpenSidebar,
}: {
  pageTitle: string;
  onOpenSidebar: () => void;
}) {
  const { theme, toggleTheme, setPalette } = useTheme();
  const isDarkTheme = theme.endsWith("-dark");
  const currentPalette = theme.replace("-dark", "") as ThemePalette;
  const paletteLabel =
    currentPalette[0].toUpperCase() + currentPalette.slice(1);

  return (
    <header className="h-16 border-b border-divider/70 flex items-center justify-between px-4 xl:px-8 bg-content1/70 backdrop-blur-xl sticky top-0 z-40">
      <div className="flex items-center gap-3">
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

      <div className="flex items-center gap-2">
        <Dropdown>
          <DropdownTrigger>
            <span className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-sm hover:bg-white/10">
              {paletteLabel}
              <ChevronDownIcon size={14} />
            </span>
          </DropdownTrigger>
          <DropdownPopover>
            <DropdownMenu aria-label="Theme palette">
              <DropdownItem key="ocean" onAction={() => setPalette("ocean")}>
                <div className="flex items-center justify-between gap-3 w-full">
                  <span>Ocean</span>
                  {currentPalette === "ocean" && <CheckIcon size={14} />}
                </div>
              </DropdownItem>
              <DropdownItem
                key="graphite"
                onAction={() => setPalette("graphite")}
              >
                <div className="flex items-center justify-between gap-3 w-full">
                  <span>Graphite</span>
                  {currentPalette === "graphite" && <CheckIcon size={14} />}
                </div>
              </DropdownItem>
              <DropdownItem key="sunset" onAction={() => setPalette("sunset")}>
                <div className="flex items-center justify-between gap-3 w-full">
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
          className="rounded-full"
        >
          {isDarkTheme ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </Button>
      </div>
    </header>
  );
}

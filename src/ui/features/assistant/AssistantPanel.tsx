import {
  Button,
  Drawer,
  ToggleButton,
  ToggleButtonGroup,
  useOverlayState,
} from "@heroui/react";
import { SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantChat } from "./AssistantChat";
import { AssistantRuns } from "./AssistantRuns";

const MIN_WIDTH = 380;
const MAX_WIDTH = 960;
const DEFAULT_WIDTH = 440;
const EXPANDED_WIDTH = 880;
const WIDTH_KEY = "monai:assistant-width";

function readStoredWidth() {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = Number(window.localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH
    ? raw
    : DEFAULT_WIDTH;
}

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "runs", label: "Runs" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Section switcher.
 *
 * HeroUI's `Tabs` stretches every tab to `w-full`, which makes two tabs read as
 * two giant pills in a 440px rail. `ToggleButtonGroup` is the design-system
 * answer for a compact single-select pair: connected segments, one shared
 * radius, and `aria-pressed` semantics for free.
 */
function SectionSwitch({
  value,
  onChange,
}: {
  value: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <ToggleButtonGroup
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      aria-label="Assistant sections"
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (next) onChange(next as TabId);
      }}
      className="shrink-0"
    >
      {TABS.map((tab) => (
        <ToggleButton key={tab.id} id={tab.id} className="px-2.5 text-xs">
          {tab.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/**
 * Right-hand assistant rail.
 *
 * HeroUI ships `Drawer` but no chat sidebar, so this composes it and adds a
 * grab thumb on the left border: drag to resize, click to snap between the
 * reading width and a wide layout, double-click to reset.
 */
export function AssistantPanel({
  state,
}: {
  state: ReturnType<typeof useOverlayState>;
}) {
  const [width, setWidthState] = useState(DEFAULT_WIDTH);
  const [tab, setTab] = useState<TabId>("chat");
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{
    startX: number;
    startWidth: number;
    moved: boolean;
  } | null>(null);
  const isWide = width > (DEFAULT_WIDTH + EXPANDED_WIDTH) / 2;

  // Restore after mount so SSR and the first client render agree.
  useEffect(() => setWidthState(readStoredWidth()), []);

  const setWidth = useCallback((next: number) => {
    const viewportMax =
      typeof window === "undefined"
        ? MAX_WIDTH
        : Math.max(MIN_WIDTH, window.innerWidth - 96);
    const clamped = Math.round(
      Math.min(Math.max(next, MIN_WIDTH), Math.min(MAX_WIDTH, viewportMax)),
    );
    setWidthState(clamped);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // Private mode / quota: the size still applies for this session.
    }
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startWidth: width, moved: false };
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; dragging still works without it.
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active) return;
    // Dragging left widens a right-hand panel, hence start - current.
    const delta = active.startX - event.clientX;
    if (Math.abs(delta) > 3) active.moved = true;
    if (active.moved) setWidth(active.startWidth + delta);
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    drag.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A real drag keeps the chosen size; a plain click snaps wide/narrow.
    if (active && !active.moved)
      setWidth(isWide ? DEFAULT_WIDTH : EXPANDED_WIDTH);
  };

  return (
    <Drawer state={state}>
      <Drawer.Backdrop variant="opaque" className="bg-black/25">
        <Drawer.Content placement="right" className="h-full">
          <Drawer.Dialog
            style={{ width: `${width}px` }}
            className={[
              "relative flex h-full max-w-[calc(100vw-1rem)] flex-col border-l border-divider bg-page p-0 text-foreground shadow-2xl",
              // Animate snaps/toggles, but never fight the pointer mid-drag.
              isDragging ? "" : "transition-[width] duration-200 ease-out",
            ].join(" ")}
          >
            {/* Grab thumb: straddles the left border, vertically centred. */}
            <button
              type="button"
              aria-label="Resize assistant panel"
              title="Drag to resize · click to toggle width · double-click to reset"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
              onKeyDown={(event) => {
                // Keyboard users get the same resizing, in 24px steps.
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setWidth(width + 24);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setWidth(width - 24);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setWidth(DEFAULT_WIDTH);
                }
              }}
              className={[
                "group absolute top-1/2 left-0 z-20 flex h-14 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center",
                // Widen the grabbable area beyond the visible pill without
                // changing the border it sits on.
                "before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
                "touch-none rounded-full border border-divider bg-content1 shadow-md select-none",
                "transition-colors hover:border-primary/40 hover:bg-content2",
                // A panel edge resizer uses the horizontal double-arrow cursor,
                // not the hand, so it reads as "drag me sideways". `!` is needed
                // because the global `button { cursor: pointer }` reset is
                // unlayered and therefore outranks Tailwind utilities.
                "cursor-col-resize!",
              ].join(" ")}
            >
              <span className="flex flex-col gap-0.5">
                <span className="h-0.5 w-0.5 rounded-full bg-default-400 group-hover:bg-primary" />
                <span className="h-0.5 w-0.5 rounded-full bg-default-400 group-hover:bg-primary" />
                <span className="h-0.5 w-0.5 rounded-full bg-default-400 group-hover:bg-primary" />
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-2 border-b border-divider bg-content1 py-2 pr-2 pl-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-cyan-500 via-blue-500 to-indigo-500 text-white shadow-sm">
                <SparklesIcon size={13} />
              </span>
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                Assistant
              </h2>
              <SectionSwitch value={tab} onChange={setTab} />
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                className="shrink-0 rounded-full"
                aria-label="Close assistant"
                onPress={() => state.setOpen(false)}
              >
                <XIcon size={14} />
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
              {tab === "chat" ? <AssistantChat /> : <AssistantRuns />}
            </div>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

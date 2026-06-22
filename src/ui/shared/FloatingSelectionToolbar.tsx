import type { ReactNode } from "react";
import { XIcon } from "lucide-react";

export type FloatingSelectionButtonVariant =
  | "ai"
  | "danger"
  | "default"
  | "review"
  | "warning";

export function floatingSelectionButtonClass({
  pressed = false,
  variant = "default",
}: {
  pressed?: boolean;
  variant?: FloatingSelectionButtonVariant;
} = {}) {
  const variantClass = {
    ai: "border-transparent bg-linear-to-br from-cyan-500 via-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35",
    danger:
      "border-divider/60 bg-background text-foreground hover:border-danger/40 hover:text-danger",
    default:
      "border-divider/60 bg-background text-foreground hover:border-primary/40 hover:text-primary",
    review: pressed
      ? "border-success/50 bg-success-soft text-success hover:border-success/60"
      : "border-divider/60 bg-background text-foreground hover:border-success/40 hover:text-success",
    warning: pressed
      ? "border-warning/50 bg-warning-soft text-warning hover:border-warning/60"
      : "border-divider/60 bg-background text-foreground hover:border-warning/40 hover:text-warning",
  }[variant];

  return [
    "flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:transform-none",
    "[&_svg]:transition-colors",
    variantClass,
  ].join(" ");
}

export function FloatingSelectionToolbar({
  children,
  count,
  onClearSelection,
}: {
  children: ReactNode;
  count: number;
  onClearSelection: () => void;
}) {
  return (
    <div
      style={{
        backgroundColor: "color-mix(in oklch, var(--background) 96%, white 4%)",
      }}
      className="fixed bottom-4 left-1/2 z-90 flex w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 items-center gap-2 rounded-3xl border border-divider p-2 shadow-2xl sm:w-auto sm:min-w-96"
    >
      <FloatingSelectionToolbarButton
        label="Clear selected transactions"
        onClick={onClearSelection}
        variant="danger"
      >
        <XIcon size={21} />
      </FloatingSelectionToolbarButton>
      <span className="min-w-0 flex-1 whitespace-nowrap px-1 text-base font-black text-foreground">
        {count} selected
      </span>
      {children}
    </div>
  );
}

export function FloatingSelectionToolbarButton({
  children,
  disabled = false,
  label,
  onClick,
  pressed = false,
  variant = "default",
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  variant?: FloatingSelectionButtonVariant;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={floatingSelectionButtonClass({ pressed, variant })}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-divider bg-foreground px-2.5 py-1.5 text-[11px] font-bold text-background opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </span>
    </span>
  );
}

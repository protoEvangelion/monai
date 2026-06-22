import { startTransition, useEffect, useState, type ReactNode } from "react";

export function StyledCheckbox({
  checked,
  deferChange = false,
  onChange,
  onClick,
  onMouseDown,
  onPointerDown,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  deferChange?: boolean;
  onChange: (checked: boolean) => void;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLInputElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLInputElement>) => void;
  "aria-label"?: string;
}) {
  const [optimisticChecked, setOptimisticChecked] = useState(checked);

  useEffect(() => {
    setOptimisticChecked(checked);
  }, [checked]);

  const handleChange = (nextChecked: boolean) => {
    setOptimisticChecked(nextChecked);

    if (deferChange) {
      startTransition(() => onChange(nextChecked));
      return;
    }

    onChange(nextChecked);
  };

  return (
    <input
      type="checkbox"
      checked={optimisticChecked}
      onChange={(event) => handleChange(event.currentTarget.checked)}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border border-default-400 bg-content2 accent-primary"
    />
  );
}

export function IconActionButton({
  children,
  count,
  disabled,
  label,
  onClick,
  tooltip,
  variant,
}: {
  children: ReactNode;
  count: number | string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tooltip: string;
  variant: "ai" | "review";
}) {
  const variantClass =
    variant === "ai"
      ? "bg-linear-to-br from-cyan-500 via-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35"
      : "bg-foreground text-background shadow-sm hover:opacity-90";
  const badgeClass =
    variant === "ai"
      ? "border-white/30 bg-white/95 text-blue-700"
      : "border-background/20 bg-background text-foreground";

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={tooltip}
        onClick={onClick}
        disabled={disabled}
        className={[
          "relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none",
          variantClass,
        ].join(" ")}
      >
        {children}
        <span
          className={[
            "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-black leading-none tabular-nums",
            badgeClass,
          ].join(" ")}
        >
          {count}
        </span>
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-divider bg-foreground px-2.5 py-1.5 text-[11px] font-bold text-background opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {tooltip}
      </span>
    </span>
  );
}

export function SettingRow({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-divider/50 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description ? <div className="mt-0.5 text-xs text-default-400">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PillButton({
  children,
  disabled = false,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        tone === "primary"
          ? "border-primary/30 bg-primary text-primary-foreground hover:brightness-95"
          : tone === "danger"
            ? "border-danger/30 bg-danger/10 text-danger hover:bg-danger/15"
            : "border-divider bg-content1 text-foreground hover:bg-content2",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked }: { checked: boolean }) {
  return (
    <span
      className={[
        "relative inline-flex h-6 w-11 rounded-full p-0.5 transition-colors",
        checked ? "bg-primary" : "bg-default-200",
      ].join(" ")}
    >
      <span
        className={[
          "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </span>
  );
}

export function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-content2 px-2.5 py-1 text-xs font-semibold text-default-500">
      {children}
    </span>
  );
}

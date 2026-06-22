export function StyledCheckbox({
  checked,
  onChange,
  onClick,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
  "aria-label"?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      aria-label={ariaLabel}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border border-default-400 bg-content2 accent-primary"
    />
  );
}

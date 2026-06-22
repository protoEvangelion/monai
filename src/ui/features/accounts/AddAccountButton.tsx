import { Button } from "@heroui/react";
import { Loader2Icon, PlusIcon } from "lucide-react";

export function AddAccountButton({
  label = "Add account",
  icon,
  variant = "primary",
  size = "md",
  onPress,
  isLoading,
}: {
  label?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
  onPress: () => void;
  isLoading: boolean;
}) {
  return (
    <Button variant={variant} size={size} onPress={onPress} isDisabled={isLoading}>
      {isLoading ? <Loader2Icon size={15} className="animate-spin" /> : (icon ?? <PlusIcon size={15} />)}
      {isLoading ? "Connecting..." : label}
    </Button>
  );
}

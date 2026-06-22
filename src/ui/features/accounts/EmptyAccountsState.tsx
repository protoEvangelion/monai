import { LandmarkIcon } from "lucide-react";
import { AddAccountButton } from "./AddAccountButton";

export function EmptyAccountsState({
  isLinkLoading,
  onOpenPlaid,
}: {
  isLinkLoading: boolean;
  onOpenPlaid: () => void;
}) {
  return (
    <div className="flex min-h-[38vh] flex-col items-center justify-center rounded-3xl border border-divider/60 bg-content1 text-center">
      <LandmarkIcon size={34} className="text-default-300" />
      <h2 className="mt-4 text-base font-bold">No accounts linked</h2>
      <p className="mt-2 max-w-sm text-sm text-default-400">
        Connect a bank to import balances, transactions, and up to 730 days of account history.
      </p>
      <div className="mt-5">
        <AddAccountButton onPress={onOpenPlaid} isLoading={isLinkLoading} />
      </div>
    </div>
  );
}

import { useRouter } from "@tanstack/react-router";
import { HomeIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createRealEstateAccount, updateRealEstateAccount } from "../../../server/accounts.fns";
import {
  createLinkToken,
  deleteAccount,
  exchangePublicToken,
  removeItem,
} from "../../../server/plaid.link.fns";
import { AccountDetailPanel } from "./AccountDetailPanel";
import { AccountGroupsList } from "./AccountGroupsList";
import { AccountSummaryCard } from "./AccountSummaryCard";
import { AddAccountButton } from "./AddAccountButton";
import { AddHomeAssetModal } from "./AddHomeAssetModal";
import { ConnectionsList } from "./ConnectionsList";
import { EmptyAccountsState } from "./EmptyAccountsState";
import { useAccountsViewModel } from "./accounts.hooks";
import type { AccountsData, ConnectionsData, NetWorthData, TransactionsData } from "./accounts.types";

export function AccountsScreen({
  accounts,
  connections,
  transactions,
  netWorthHistory,
}: {
  accounts: AccountsData;
  connections: ConnectionsData;
  transactions: TransactionsData;
  netWorthHistory: NetWorthData;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isLinkLoading, setIsLinkLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<number | null>(null);
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);
  const vm = useAccountsViewModel({ accounts, transactions });

  const { open, ready } = usePlaidLink({
    token: token ?? "",
    onSuccess: async (publicToken, metadata) => {
      try {
        const institutionName = metadata?.institution?.name ?? undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (exchangePublicToken as any)({
          data: { publicToken, institutionName },
        });
        await router.invalidate();
      } finally {
        setIsLinkLoading(false);
        setToken(null);
      }
    },
    onExit: () => {
      setToken(null);
      setIsLinkLoading(false);
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const handleDeleteAccount = async (id: number) => {
    if (!confirm("Remove this account from Monai?")) return;
    setIsDeleting(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (deleteAccount as any)({ data: { id } });
      await router.invalidate();
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDisconnectBank = async (plaidItemId: number | null) => {
    if (!plaidItemId) return;
    if (!confirm("Disconnect this institution and remove its local data?")) return;
    setIsDisconnecting(plaidItemId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (removeItem as any)({ data: { id: plaidItemId } });
      await router.invalidate();
    } finally {
      setIsDisconnecting(null);
    }
  };

  const handleOpenPlaid = async () => {
    if (isLinkLoading) return;

    setIsLinkLoading(true);
    try {
      const linkToken = await createLinkToken();
      setToken(linkToken);
    } catch {
      setIsLinkLoading(false);
      setToken(null);
    }
  };

  const handleCreateHomeAsset = async (input: { name: string; value: number }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (createRealEstateAccount as any)({ data: input });
    await router.invalidate();
  };

  const handleUpdateHomeAsset = async (input: { id: number; name: string; value: number }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (updateRealEstateAccount as any)({ data: input });
    await router.invalidate();
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-3xl border border-divider/60 bg-background/70 shadow-sm">
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-divider/60 bg-background/90 px-6 backdrop-blur-xl">
          <h1 className="text-lg font-bold">Accounts</h1>
          <div className="flex items-center gap-2">
            <AddAccountButton
              label="Add home"
              icon={<HomeIcon size={15} />}
              variant="ghost"
              size="sm"
              onPress={() => setIsHomeModalOpen(true)}
              isLoading={false}
            />
            <AddAccountButton
              label="Add"
              icon={<PlusIcon size={15} />}
              size="sm"
              onPress={handleOpenPlaid}
              isLoading={isLinkLoading}
            />
          </div>
        </div>

        <div className="space-y-6 p-6">
          <AccountSummaryCard
            accountCount={accounts.length}
            netWorth={vm.netWorth}
            netWorthHistory={netWorthHistory}
            totalAssets={vm.totalAssets}
            totalDebts={vm.totalDebts}
          />

          <ConnectionsList
            connections={connections}
            isDisconnecting={isDisconnecting}
            isLinkLoading={isLinkLoading}
            onDisconnect={handleDisconnectBank}
            onOpenPlaid={handleOpenPlaid}
          />

          {Object.keys(vm.grouped).length === 0 ? (
            <EmptyAccountsState isLinkLoading={isLinkLoading} onOpenPlaid={handleOpenPlaid} />
          ) : (
            <AccountGroupsList
              grouped={vm.grouped}
              selectedAccount={vm.selectedAccount}
              onSelectAccount={vm.setSelectedAccountId}
            />
          )}
        </div>
      </section>

      <AccountDetailPanel
        accountTransactions={vm.accountTransactions}
        isDeleting={isDeleting}
        onDeleteAccount={handleDeleteAccount}
        onUpdateHomeAsset={handleUpdateHomeAsset}
        selectedAccount={vm.selectedAccount}
      />

      <AddHomeAssetModal
        isOpen={isHomeModalOpen}
        onClose={() => setIsHomeModalOpen(false)}
        onSave={handleCreateHomeAsset}
      />
    </div>
  );
}

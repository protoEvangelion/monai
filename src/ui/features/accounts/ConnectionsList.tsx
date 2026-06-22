import { BuildingIcon, PlusIcon, RefreshCwIcon, Trash2Icon, Loader2Icon } from "lucide-react";
import { AddAccountButton } from "./AddAccountButton";
import type { ConnectionsData } from "./accounts.types";

export function ConnectionsList({
  connections,
  isDisconnecting,
  isLinkLoading,
  onDisconnect,
  onOpenPlaid,
}: {
  connections: ConnectionsData;
  isDisconnecting: number | null;
  isLinkLoading: boolean;
  onDisconnect: (plaidItemId: number | null) => void;
  onOpenPlaid: () => void;
}) {
  if (connections.length === 0) return null;

  return (
    <div className="rounded-2xl border border-divider/60 bg-content1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <BuildingIcon size={15} /> Connections
        </h2>
        <AddAccountButton
          label="New"
          icon={<PlusIcon size={14} />}
          variant="ghost"
          size="sm"
          onPress={onOpenPlaid}
          isLoading={isLinkLoading}
        />
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {connections.map((connection) => (
          <div
            key={connection.id}
            className="flex items-center justify-between rounded-xl border border-divider/50 bg-background/60 px-3 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {connection.institutionName ?? "Unknown institution"}
              </div>
              <div className="text-xs text-default-400">
                {connection.accountCount} account{connection.accountCount !== 1 ? "s" : ""} ·
                richer history enabled
              </div>
            </div>
            <div className="flex items-center gap-1">
              <AddAccountButton
                label="Reconnect"
                icon={<RefreshCwIcon size={14} />}
                variant="ghost"
                size="sm"
                onPress={onOpenPlaid}
                isLoading={isLinkLoading}
              />
              <button
                type="button"
                aria-label="Disconnect institution"
                disabled={isDisconnecting === connection.id}
                onClick={() => onDisconnect(connection.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {isDisconnecting === connection.id ? (
                  <Loader2Icon size={15} className="animate-spin" />
                ) : (
                  <Trash2Icon size={15} />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

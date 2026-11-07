import { useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createLinkToken, exchangePublicToken } from "../../../server/plaid.link.fns";
import { showToast } from "../../shared/toast";

type PlaidLinkContextValue = {
  isLinkLoading: boolean;
  /** Opens Plaid Link. Pass an item id to repair an existing connection (update mode). */
  openPlaidLink: (plaidItemId?: number) => Promise<void>;
};

const PlaidLinkContext = createContext<PlaidLinkContextValue | null>(null);

export function PlaidLinkProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [repairItemId, setRepairItemId] = useState<number | null>(null);
  const [isLinkLoading, setIsLinkLoading] = useState(false);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken, metadata) => {
      try {
        const institutionName = metadata?.institution?.name ?? undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (exchangePublicToken as any)({
          data: { publicToken, institutionName, itemId: repairItemId ?? undefined },
        });
        await router.invalidate();
        showToast({
          title: result?.repaired ? "Connection restored" : "Account connected",
          description: institutionName
            ? `${institutionName} is ready to sync.`
            : "Your bank is ready to sync.",
        });
      } catch (error) {
        showToast({
          title: "Could not connect bank",
          description: error instanceof Error ? error.message : "Connection failed.",
          tone: "danger",
        });
      } finally {
        setIsLinkLoading(false);
        setToken(null);
        setRepairItemId(null);
      }
    },
    onExit: () => {
      setToken(null);
      setRepairItemId(null);
      setIsLinkLoading(false);
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  const openPlaidLink = useCallback(
    async (plaidItemId?: number) => {
      if (isLinkLoading) return;

      setIsLinkLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { linkToken } = await (createLinkToken as any)({
          data: plaidItemId ? { plaidItemId } : {},
        });
        setRepairItemId(plaidItemId ?? null);
        setToken(linkToken);
      } catch (error) {
        setIsLinkLoading(false);
        setToken(null);
        showToast({
          title: "Could not open Plaid Link",
          description: error instanceof Error ? error.message : "Try again in a moment.",
          tone: "danger",
        });
      }
    },
    [isLinkLoading],
  );

  return (
    <PlaidLinkContext.Provider value={{ isLinkLoading, openPlaidLink }}>
      {children}
    </PlaidLinkContext.Provider>
  );
}

export function usePlaidLinkContext() {
  const context = useContext(PlaidLinkContext);
  if (!context) {
    throw new Error("usePlaidLinkContext must be used within PlaidLinkProvider");
  }
  return context;
}

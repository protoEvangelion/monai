import {
  BriefcaseIcon,
  CreditCardIcon,
  HomeIcon,
  LandmarkIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import type { AccountTypeConfig } from "./accounts.types";

export const ACCOUNT_TYPE_CONFIG: Record<string, AccountTypeConfig> = {
  credit: {
    label: "Credit cards",
    icon: <CreditCardIcon size={18} />,
    isDebt: true,
  },
  cash: {
    label: "Depository",
    icon: <LandmarkIcon size={18} />,
    isDebt: false,
  },
  investment: {
    label: "Investments",
    icon: <TrendingUpIcon size={18} />,
    isDebt: false,
  },
  loan: {
    label: "Loans",
    icon: <BriefcaseIcon size={18} />,
    isDebt: true,
  },
  real_estate: {
    label: "Real estate",
    icon: <HomeIcon size={18} />,
    isDebt: false,
  },
  other: {
    label: "Other",
    icon: <WalletIcon size={18} />,
    isDebt: false,
  },
};

export const ACCOUNT_CHART_RANGES = ["1W", "1M", "3M", "YTD", "1Y", "ALL"];

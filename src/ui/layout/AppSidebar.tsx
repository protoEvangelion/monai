import { Link } from "@tanstack/react-router";
import { Button, Separator } from "@heroui/react";
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  WalletIcon,
  PieChartIcon,
  ChevronRightIcon,
  SettingsIcon,
  HelpCircleIcon,
  CreditCardIcon,
  LandmarkIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import HeaderUser from "../integrations/clerk/header-user";
import { formatCurrency } from "../../lib/format";
import { useState } from "react";

export type SidebarAccount = {
  type: string;
  group: string;
  balance: number;
};

function getSidebarIcon(type: string) {
  if (type === "credit")
    return <CreditCardIcon size={16} className="text-primary" />;
  if (type === "cash")
    return <LandmarkIcon size={16} className="text-success" />;
  if (type === "investment")
    return <TrendingUpIcon size={16} className="text-warning" />;
  if (type === "loan") return <WalletIcon size={16} className="text-danger" />;
  return <PieChartIcon size={16} className="text-default-400" />;
}

function SidebarLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-primary/20 text-primary font-semibold hover:bg-primary/30" }}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-default-600 transition-colors hover:bg-default-200"
    >
      <span>{icon}</span>
      <span className="text-sm">{label}</span>
    </Link>
  );
}

function SidebarStaticItem({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-default-500/90">
      <span>{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function AppSidebar({
  sidebarAccounts,
  onClose,
}: {
  sidebarAccounts: SidebarAccount[];
  onClose?: () => void;
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  );

  const assets = sidebarAccounts.filter((acc) =>
    ["cash", "investment", "real_estate"].includes(acc.type),
  );
  const liabilities = sidebarAccounts.filter((acc) =>
    ["credit", "loan"].includes(acc.type),
  );
  const other = sidebarAccounts.filter(
    (acc) =>
      !["cash", "investment", "real_estate", "credit", "loan"].includes(
        acc.type,
      ),
  );

  const sections = [
    { title: "Assets", items: assets },
    { title: "Liabilities", items: liabilities },
    { title: "Other", items: other },
  ].filter((section) => section.items.length > 0);

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col gap-3 px-3 pb-4 pt-3">
      {/* Logo + User */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2.5 hover:opacity-85 transition-opacity"
        >
          <img src="/favicon.svg" alt="Monai" className="h-8 w-8" />
          <span className="font-black text-xl tracking-tight text-foreground">
            MONAI
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <HeaderUser />
          {onClose ? (
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              className="rounded-full"
              aria-label="Close sidebar"
              onPress={onClose}
            >
              <XIcon size={16} />
            </Button>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-col gap-1" onClickCapture={onClose}>
        <SidebarLink
          to="/"
          icon={<LayoutDashboardIcon size={18} />}
          label="Dashboard"
        />
        <SidebarLink
          to="/categories"
          icon={<PieChartIcon size={18} />}
          label="Categories"
        />
        <SidebarLink
          to="/transactions"
          icon={<ArrowLeftRightIcon size={18} />}
          label="Transactions"
        />
        <SidebarLink
          to="/accounts"
          icon={<WalletIcon size={18} />}
          label="Accounts"
        />
      </nav>

      {/* Account Summary */}
      <Separator className="my-1 bg-divider/50" />
      <div className="min-h-0 flex-1">
        <div className="mb-2 px-2" />
        <div className="h-full overflow-y-auto pr-1">
          {sections.length > 0 ? (
            <div className="flex flex-col gap-3 pb-2">
              {sections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-default-400 transition-colors hover:bg-primary/10"
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={expandedSections.has(section.title)}
                  >
                    <ChevronRightIcon
                      size={12}
                      className={expandedSections.has(section.title) ? "rotate-90 transition-transform" : "transition-transform"}
                    />
                    <span>{section.title}</span>
                  </button>
                  {expandedSections.has(section.title)
                    ? section.items.map((acc) => (
                        <div
                          key={acc.type}
                          className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/10"
                        >
                          <div className="flex items-center gap-2">
                            {getSidebarIcon(acc.type)}
                            <span className="text-sm font-medium text-default-600">
                              {acc.group}
                            </span>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-default-500">
                            {formatCurrency(acc.balance, {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </div>
                      ))
                    : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-2 py-2 text-sm text-default-400">
              No accounts linked
            </div>
          )}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-2">
        <Separator className="bg-divider/50" />
        <div className="flex flex-col gap-1 px-1">
          <SidebarStaticItem
            icon={<SettingsIcon size={18} />}
            label="Settings"
          />
          <SidebarStaticItem
            icon={<HelpCircleIcon size={18} />}
            label="Get Help"
          />
        </div>
        <div className="h-1" />
      </div>
    </div>
  );
}

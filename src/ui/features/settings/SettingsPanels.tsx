import {
  CircleHelpIcon,
  CopyIcon,
  CreditCardIcon,
  MoonIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { PillButton, SettingRow, StatusBadge, Toggle } from "./settings.controls";
import type { SettingsTab } from "./settings.types";

function GeneralSettingsPanel() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-foreground">Appearance</h3>
        <SettingRow
          title="Theme"
          description="Use the theme controls in the app header while this settings surface is being wired."
          action={
            <div className="flex rounded-xl bg-content2 p-1 text-sm font-semibold">
              <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-default-500">
                <SunIcon size={14} /> Light
              </button>
              <button className="rounded-lg bg-background px-3 py-1.5 text-foreground shadow-sm">
                Auto
              </button>
              <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-default-500">
                <MoonIcon size={14} /> Dark
              </button>
            </div>
          }
        />
      </section>
      <section>
        <h3 className="text-sm font-bold text-foreground">Budgeting</h3>
        <SettingRow
          title="Zero-based budgeting"
          description="Expected income minus category allocations should equal zero."
          action={<Toggle checked />}
        />
        <SettingRow
          title="Rollover"
          description="Rollover budgeting is not implemented yet."
          action={<StatusBadge>Planned</StatusBadge>}
        />
      </section>
      <section>
        <h3 className="text-sm font-bold text-foreground">Automation</h3>
        <SettingRow
          title="AI auto-categorization"
          description="Manual AI categorization is available from transaction tables."
          action={<StatusBadge>Manual</StatusBadge>}
        />
      </section>
    </div>
  );
}

function ConnectionsSettingsPanel() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-foreground">Connections</h3>
        <SettingRow
          title="Linked institutions"
          description="Manage Plaid connections and reconnect institutions from the Accounts page."
          action={<StatusBadge>Accounts</StatusBadge>}
        />
        <SettingRow
          title="Historical data"
          description="Monai keeps imported history locally after the initial sync."
          action={<StatusBadge>Enabled</StatusBadge>}
        />
      </section>
    </div>
  );
}

function AccountSettingsPanel() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-foreground">Information</h3>
        <SettingRow
          title="Email"
          description="Managed by Clerk authentication."
          action={
            <PillButton disabled>
              <CopyIcon size={14} /> Copy
            </PillButton>
          }
        />
        <SettingRow
          title="Two-factor authentication"
          description="Configure sign-in methods in Clerk."
          action={
            <PillButton disabled>
              <ShieldCheckIcon size={14} /> Clerk
            </PillButton>
          }
        />
      </section>
      <section>
        <h3 className="text-sm font-bold text-foreground">Data</h3>
        <SettingRow
          title="Export all transactions"
          description="CSV export has not been implemented yet."
          action={<StatusBadge>Planned</StatusBadge>}
        />
        <SettingRow
          title="Clear local cache"
          description="Use this only after a dedicated cache-reset action exists."
          action={<StatusBadge>Unavailable</StatusBadge>}
        />
      </section>
    </div>
  );
}

function SubscriptionSettingsPanel() {
  return (
    <section>
      <h3 className="text-sm font-bold text-foreground">Subscription</h3>
      <SettingRow
        title="Billing"
        description="No billing provider is connected in this app yet."
        action={<StatusBadge>Not configured</StatusBadge>}
      />
      <SettingRow
        title="Plan management"
        description="Add a billing integration before showing plan controls."
        action={
          <PillButton disabled>
            <CreditCardIcon size={14} /> Manage
          </PillButton>
        }
      />
    </section>
  );
}

function AboutSettingsPanel() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-bold text-foreground">About</h3>
        <SettingRow title="Product" description="Monai" action={<StatusBadge>Local dev</StatusBadge>} />
      </section>
      <section>
        <h3 className="text-sm font-bold text-foreground">Help</h3>
        <SettingRow
          title="Support"
          description="Support links should be added once public docs exist."
          action={<StatusBadge>Planned</StatusBadge>}
        />
      </section>
    </div>
  );
}

export function SettingsPanel({ activeTab }: { activeTab: SettingsTab }) {
  if (activeTab === "general") return <GeneralSettingsPanel />;
  if (activeTab === "connections") return <ConnectionsSettingsPanel />;
  if (activeTab === "account") return <AccountSettingsPanel />;
  if (activeTab === "subscription") return <SubscriptionSettingsPanel />;
  return <AboutSettingsPanel />;
}

export const settingsTabs: Array<{
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "general", label: "General", icon: <SparklesIcon size={16} /> },
  { id: "connections", label: "Connections", icon: <CircleHelpIcon size={16} /> },
  { id: "account", label: "Account", icon: <UserIcon size={16} /> },
  { id: "subscription", label: "Subscription", icon: <CreditCardIcon size={16} /> },
  { id: "about", label: "About", icon: <CircleHelpIcon size={16} /> },
];

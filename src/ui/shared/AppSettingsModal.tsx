import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2Icon,
  CheckIcon,
  CircleHelpIcon,
  CopyIcon,
  CreditCardIcon,
  LogOutIcon,
  MoonIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";

type SettingsTab = "general" | "connections" | "account" | "subscription" | "about";

const tabs: Array<{
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "general", label: "General", icon: <SparklesIcon size={16} /> },
  { id: "connections", label: "Connections", icon: <Building2Icon size={16} /> },
  { id: "account", label: "Account", icon: <UserIcon size={16} /> },
  { id: "subscription", label: "Subscription", icon: <CreditCardIcon size={16} /> },
  { id: "about", label: "About", icon: <CircleHelpIcon size={16} /> },
];

function SettingRow({
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

function PillButton({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <button
      type="button"
      className={[
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
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

function Toggle({ checked }: { checked: boolean }) {
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

export function AppSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section className="relative z-10 flex h-[min(82vh,720px)] w-full max-w-5xl overflow-hidden rounded-3xl border border-divider bg-background shadow-2xl">
        <aside className="w-64 shrink-0 border-r border-divider/70 bg-content1 p-3">
          <div className="mb-3 flex items-center justify-between px-2 py-2">
            <div>
              <h2 className="text-lg font-bold">Settings</h2>
              <p className="text-xs text-default-400">Configure Monai</p>
            </div>
            <button
              type="button"
              aria-label="Close settings"
              className="flex h-8 w-8 items-center justify-center rounded-full text-default-400 hover:bg-content2 hover:text-foreground"
              onClick={onClose}
            >
              <XIcon size={16} />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                  activeTab === tab.id
                    ? "bg-primary/15 text-primary"
                    : "text-default-500 hover:bg-content2 hover:text-foreground",
                ].join(" ")}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {activeTab === "general" ? (
            <div className="space-y-8">
              <section>
                <h3 className="text-sm font-bold text-foreground">Appearance</h3>
                <SettingRow
                  title="Theme"
                  description="Choose a display mode for the dashboard."
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
                  description="Carry unused category budget into future months."
                  action={<Toggle checked={false} />}
                />
              </section>
              <section>
                <h3 className="text-sm font-bold text-foreground">Automation</h3>
                <SettingRow
                  title="AI auto-categorization"
                  description="Automatically categorize new synced transactions using your existing categories."
                  action={<Toggle checked />}
                />
              </section>
            </div>
          ) : null}

          {activeTab === "connections" ? (
            <div className="space-y-8">
              <section className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
                <div className="mb-3 text-sm font-bold text-warning">Needs attention</div>
                <SettingRow
                  title="Connection stopped syncing"
                  description="Re-verify credentials to resume imports."
                  action={
                    <PillButton tone="primary">
                      <RefreshCwIcon size={14} /> Re-verify
                    </PillButton>
                  }
                />
                <SettingRow
                  title="New accounts found"
                  description="Sign in to choose which accounts to add."
                  action={<PillButton>Sign in</PillButton>}
                />
              </section>
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Connections</h3>
                  <PillButton tone="primary">New</PillButton>
                </div>
                {["Fidelity", "Chase", "Vanguard", "Zillow"].map((name, index) => (
                  <SettingRow
                    key={name}
                    title={name}
                    description={`Linked with ${index + 1} account${index === 0 ? "s" : ""} · 730-day history enabled`}
                    action={<span className="text-default-300">›</span>}
                  />
                ))}
              </section>
            </div>
          ) : null}

          {activeTab === "account" ? (
            <div className="space-y-8">
              <section>
                <h3 className="text-sm font-bold text-foreground">Information</h3>
                <SettingRow
                  title="Email"
                  description="Signed in account"
                  action={
                    <PillButton>
                      <CopyIcon size={14} /> Copy
                    </PillButton>
                  }
                />
                <SettingRow
                  title="Two-factor authentication"
                  description="Require a code when signing in."
                  action={
                    <PillButton>
                      <ShieldCheckIcon size={14} /> Enable 2FA
                    </PillButton>
                  }
                />
              </section>
              <section>
                <h3 className="text-sm font-bold text-foreground">Actions</h3>
                <SettingRow
                  title="Export all transactions"
                  description="Download a detailed CSV file."
                  action={<PillButton>Download</PillButton>}
                />
                <SettingRow
                  title="Clear local cache"
                  description="Refresh local app data if support asks you to."
                  action={<PillButton>Clear cache</PillButton>}
                />
                <SettingRow
                  title="Log out"
                  action={
                    <PillButton>
                      <LogOutIcon size={14} /> Log out
                    </PillButton>
                  }
                />
                <SettingRow
                  title="Delete account"
                  description="Permanently remove your Monai account."
                  action={
                    <PillButton tone="danger">
                      <Trash2Icon size={14} /> Delete
                    </PillButton>
                  }
                />
              </section>
            </div>
          ) : null}

          {activeTab === "subscription" ? (
            <section>
              <h3 className="text-sm font-bold text-foreground">Subscription</h3>
              <SettingRow
                title="Monthly"
                description="$13/month · renews automatically"
                action={<PillButton>Change plan</PillButton>}
              />
              <SettingRow
                title="Payment method"
                description="Card on file"
                action={<PillButton>Manage payment</PillButton>}
              />
              <SettingRow
                title="Cancel subscription"
                action={<PillButton tone="danger">Cancel subscription</PillButton>}
              />
            </section>
          ) : null}

          {activeTab === "about" ? (
            <div className="space-y-8">
              <section>
                <h3 className="text-sm font-bold text-foreground">About</h3>
                <SettingRow
                  title="Version"
                  description="26.5.12+1417"
                  action={
                    <PillButton>
                      <CopyIcon size={14} /> Copy
                    </PillButton>
                  }
                />
              </section>
              <section>
                <h3 className="text-sm font-bold text-foreground">Help</h3>
                <SettingRow title="Help center" action={<PillButton>Open</PillButton>} />
                <SettingRow title="Contact support" action={<PillButton>Contact</PillButton>} />
              </section>
              <section>
                <h3 className="text-sm font-bold text-foreground">Legal</h3>
                <SettingRow title="Terms of service" action={<PillButton>View</PillButton>} />
                <SettingRow title="Privacy policy" action={<PillButton>View</PillButton>} />
              </section>
            </div>
          ) : null}
        </main>
        <div className="pointer-events-none absolute bottom-4 right-5 flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          <CheckIcon size={13} />
          Local-first controls
        </div>
      </section>
    </div>,
    document.body,
  );
}

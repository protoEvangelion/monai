import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, XIcon } from "lucide-react";
import { SettingsPanel, settingsTabs } from "./SettingsPanels";
import type { SettingsTab } from "./settings.types";

export function AppSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
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
            {settingsTabs.map((tab) => (
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
          <SettingsPanel activeTab={activeTab} />
        </main>
        <div className="pointer-events-none absolute bottom-4 right-5 flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          <CheckIcon size={13} />
          Local controls
        </div>
      </section>
    </div>,
    document.body,
  );
}

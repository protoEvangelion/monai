import { useEffect, useState } from "react";
import { AlertCircleIcon, XIcon } from "lucide-react";

type ToastTone = "danger" | "default";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastItem = ToastInput & {
  id: number;
};

const TOAST_EVENT = "monai:toast";

export function showToast(toast: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: toast }));
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastInput>).detail;
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { ...detail, id }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 6_000);
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "danger" ? "alert" : "status"}
          style={{
            backgroundColor: "color-mix(in oklch, var(--background) 94%, white 6%)",
          }}
          className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-divider px-4 py-3 text-foreground shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
        >
          <span
            className={[
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              toast.tone === "danger" ? "bg-danger/12 text-danger" : "bg-primary/12 text-primary",
            ].join(" ")}
          >
            <AlertCircleIcon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{toast.title}</div>
            {toast.description ? (
              <div className="mt-0.5 line-clamp-3 text-xs font-medium leading-5 text-default-500">
                {toast.description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-default-400 hover:bg-content2 hover:text-foreground"
          >
            <XIcon size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

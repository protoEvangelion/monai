import { ChevronRightIcon } from "lucide-react";

export function UpcomingPaymentsCard() {
  return (
    <div className="bg-background/60 backdrop-blur-md border border-divider/40 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h5 className="font-bold text-sm">Next two weeks</h5>
        <span className="flex items-center gap-1 text-xs text-default-400">
          Recurrings <ChevronRightIcon size={14} />
        </span>
      </div>
      <p className="text-sm text-default-300 italic text-center py-3">
        There are no upcoming payments
      </p>
    </div>
  );
}

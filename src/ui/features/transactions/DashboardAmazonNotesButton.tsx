import { Tooltip } from "@mantine/core";
import { useServerFn } from "@tanstack/react-start";
import { Loader2Icon, ShoppingBagIcon } from "lucide-react";
import { useState } from "react";
import { runAmazonTransactionNotes } from "../../../server/amazon-notes.fns";
import { showToast } from "../../shared/toast";

const TOOLTIP = "Start the Amazon notes skill for unreviewed charges that have no note.";

export function DashboardAmazonNotesButton() {
  const startAmazonNotes = useServerFn(runAmazonTransactionNotes);
  const [isRunning, setIsRunning] = useState(false);

  const handleClick = () => {
    if (isRunning) return;
    setIsRunning(true);
    void (async () => {
      try {
        const result = await startAmazonNotes();
        showToast({
          title: result.alreadyRunning ? "Amazon notes already running" : "Amazon notes started",
          description: result.alreadyRunning
            ? "The skill is still adding notes to unreviewed Amazon charges."
            : "It will add notes to unreviewed Amazon charges that don't have one.",
        });
      } catch (error) {
        showToast({
          title: "Amazon notes failed",
          description: error instanceof Error ? error.message : "Could not start the Amazon notes skill.",
          tone: "danger",
        });
      } finally {
        setIsRunning(false);
      }
    })();
  };

  return (
    <Tooltip label={TOOLTIP} withArrow openDelay={200} position="bottom" withinPortal>
      <button
        type="button"
        aria-label="Amazon notes"
        disabled={isRunning}
        onClick={handleClick}
        className={[
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-divider/70 bg-background px-2.5",
          "text-[11px] font-bold tracking-wide text-foreground transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-primary/40",
          "disabled:cursor-not-allowed disabled:opacity-45 disabled:transform-none",
        ].join(" ")}
      >
        {isRunning ? <Loader2Icon size={13} className="animate-spin" /> : <ShoppingBagIcon size={13} />}
        Amazon
      </button>
    </Tooltip>
  );
}

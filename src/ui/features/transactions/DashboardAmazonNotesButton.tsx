import { Tooltip } from "@mantine/core";
import { ShoppingBagIcon } from "lucide-react";
import { requestAssistantSkill } from "../assistant/assistantRequest";

const TOOLTIP = "Open the assistant to paste your Amazon payment history.";

/**
 * Opens the assistant with the Amazon skill card already in the thread.
 *
 * The card collects the scrape JSON and runs the matcher in-process, so the
 * progress and the result show up in the chat instead of a separate modal.
 */
export function DashboardAmazonNotesButton() {
  return (
    <Tooltip label={TOOLTIP} withArrow openDelay={200} position="bottom" withinPortal>
      <button
        type="button"
        aria-label="Amazon notes"
        onClick={() => requestAssistantSkill("categorize-amazon-transactions")}
        className={[
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-divider/70 bg-background px-2.5",
          "text-[11px] font-bold tracking-wide text-foreground transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-primary/40",
        ].join(" ")}
      >
        <ShoppingBagIcon size={13} />
        Amazon
      </button>
    </Tooltip>
  );
}

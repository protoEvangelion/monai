import { Tooltip } from "@mantine/core";
import { ShoppingBagIcon } from "lucide-react";
import { useState } from "react";
import { AmazonNotesModal } from "./AmazonNotesModal";

const TOOLTIP = "Paste your Amazon payment history to note recent charges.";

export function DashboardAmazonNotesButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Tooltip label={TOOLTIP} withArrow openDelay={200} position="bottom" withinPortal>
        <button
          type="button"
          aria-label="Amazon notes"
          onClick={() => setIsOpen(true)}
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
      <AmazonNotesModal isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

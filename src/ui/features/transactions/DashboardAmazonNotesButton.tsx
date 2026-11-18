import { Tooltip } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { ShoppingBagIcon } from "lucide-react";

const TOOLTIP = "Reconcile Amazon charges with one bookmarklet click.";

/**
 * Sends the user to the one-click importer.
 *
 * The old path opened an assistant card that asked for a DevTools console paste
 * and a JSON blob. /amazon-import replaces that with a draggable bookmarklet,
 * so this is a plain link — no panel, no paste.
 */
export function DashboardAmazonNotesButton() {
  return (
    <Tooltip label={TOOLTIP} withArrow openDelay={200} position="bottom" withinPortal>
      <Link
        to="/amazon-import"
        aria-label="Amazon notes"
        className={[
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-divider/70 bg-background px-2.5",
          "text-[11px] font-bold tracking-wide text-foreground transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-primary/40",
        ].join(" ")}
      >
        <ShoppingBagIcon size={13} />
        Amazon
      </Link>
    </Tooltip>
  );
}

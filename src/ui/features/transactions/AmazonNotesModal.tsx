import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardPasteIcon, ShoppingBagIcon } from "lucide-react";
import { useState } from "react";
import { reconcileAmazonNotes } from "../../../server/amazon-notes.fns";
import { showToast } from "../../shared/toast";
import { finishRun, logRunEvent, startRun } from "../assistant/runs";

const STEPS = [
  "Open Amazon → Your Payments → Transactions (signed in).",
  "DevTools → Console → paste scripts/amazon-scrape-in-browser.js.",
  "Wait for “done — N payments”, then paste the copied JSON here.",
];

export function AmazonNotesModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const reconcile = useServerFn(reconcileAmazonNotes);
  const [json, setJson] = useState("");
  const [targets, setTargets] = useState("");
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    updatedCount: number;
    matchedCount: number;
    skippedCount: number;
    worklistCount: number;
    skipped: Array<{ transactionId: number; amount: number; reason: string }>;
  } | null>(null);

  const reset = () => {
    setJson("");
    setTargets("");
    setResult(null);
    setIsRunning(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isRunning) return;
    if (!open) reset();
    onOpenChange(open);
  };

  const handleReconcile = () => {
    if (isRunning || !json.trim()) return;
    setIsRunning(true);
    setResult(null);
    const runId = startRun("Amazon match", "Local matcher");
    logRunEvent(runId, "Parsing pasted scrape JSON");
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const output = await (reconcile as any)({
          data: {
            scrapeJson: json.trim(),
            targets: targets.trim() || "all",
            unreviewedOnly,
          },
        });

        setResult(output);
        if (output.updatedCount > 0) await router.invalidate();

        logRunEvent(
          runId,
          `${output.matchedCount} matched, ${output.updatedCount} noted, ${output.skippedCount} skipped`,
        );
        finishRun(runId, {
          status: output.updatedCount > 0 ? "done" : "failed",
          summary:
            output.updatedCount > 0
              ? `Added notes to ${output.updatedCount} Amazon charge${output.updatedCount === 1 ? "" : "s"}.`
              : `No notes added across ${output.targetedCount} charge${output.targetedCount === 1 ? "" : "s"}.`,
        });

        showToast({
          title:
            output.updatedCount > 0
              ? `Added ${output.updatedCount} Amazon note${output.updatedCount === 1 ? "" : "s"}`
              : "No notes added",
          description:
            output.updatedCount > 0
              ? `${output.skippedCount} charge${output.skippedCount === 1 ? "" : "s"} left for you to check.`
              : `Checked ${output.targetedCount} charge${output.targetedCount === 1 ? "" : "s"} against the scrape.`,
          tone: output.updatedCount > 0 ? "default" : "danger",
        });
      } catch (error) {
        finishRun(runId, {
          status: "failed",
          summary: error instanceof Error ? error.message : "Could not read that JSON.",
        });
        showToast({
          title: "Amazon match failed",
          description: error instanceof Error ? error.message : "Could not read that JSON.",
          tone: "danger",
        });
      } finally {
        setIsRunning(false);
      }
    })();
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalBackdrop variant="opaque" className="bg-black/55">
        <ModalContainer placement="center" className="px-4">
          <ModalDialog className="w-full max-w-2xl overflow-hidden rounded-2xl border border-divider bg-content1 p-0 text-foreground shadow-2xl">
            <ModalHeader className="border-b border-divider px-6 py-5">
              <ModalHeading className="flex items-center gap-2 text-lg font-bold">
                <ShoppingBagIcon size={18} />
                Match Amazon purchases
              </ModalHeading>
            </ModalHeader>

            <ModalBody className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 py-5">
              <ol className="flex flex-col gap-1 text-xs font-medium text-default-500">
                {STEPS.map((step, index) => (
                  <li key={step}>
                    <span className="font-bold text-foreground">{index + 1}.</span> {step}
                  </li>
                ))}
              </ol>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Scrape JSON</span>
                <textarea
                  value={json}
                  onChange={(event) => setJson(event.target.value)}
                  spellCheck={false}
                  placeholder='{"payments":[…],"orders":[…] }'
                  className="h-40 w-full resize-y rounded-xl border border-divider bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
                />
              </label>

              <div className="flex flex-wrap items-end gap-4">
                <label className="flex min-w-48 flex-1 flex-col gap-1.5">
                  <span className="text-sm font-semibold">Targets</span>
                  <input
                    value={targets}
                    onChange={(event) => setTargets(event.target.value)}
                    placeholder="all"
                    className="rounded-xl border border-divider bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-xs text-default-400">
                    Leave blank for every Amazon charge missing a note.
                  </span>
                </label>

                <label className="flex items-center gap-2 pb-6 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={unreviewedOnly}
                    onChange={(event) => setUnreviewedOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-divider"
                  />
                  Unreviewed only
                </label>
              </div>

              {result ? (
                <div className="rounded-xl border border-divider bg-background/60 px-4 py-3 text-xs">
                  <div className="font-bold text-foreground">
                    {result.updatedCount} noted · {result.matchedCount} matched ·{" "}
                    {result.skippedCount} skipped (of {result.worklistCount} missing notes)
                  </div>
                  {result.skipped.length > 0 ? (
                    <ul className="mt-2 flex max-h-32 flex-col gap-1 overflow-y-auto text-default-500">
                      {result.skipped.slice(0, 20).map((skip) => (
                        <li key={skip.transactionId}>
                          #{skip.transactionId} · ${skip.amount.toFixed(2)} — {skip.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </ModalBody>

            <ModalFooter className="flex justify-end gap-3 border-t border-divider px-6 py-4">
              <Button
                onPress={() => handleOpenChange(false)}
                isDisabled={isRunning}
                className="rounded-lg bg-default-100"
              >
                Close
              </Button>
              <Button
                variant="primary"
                onPress={handleReconcile}
                isDisabled={isRunning || !json.trim()}
                className="rounded-lg"
              >
                <ClipboardPasteIcon size={15} />
                {isRunning ? "Matching..." : "Match & add notes"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

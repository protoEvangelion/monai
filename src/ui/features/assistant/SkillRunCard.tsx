import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  Link,
  Spinner,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  CheckIcon,
  ClipboardCopyIcon,
  ClipboardPasteIcon,
  RotateCcwIcon,
  ShoppingBagIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import type { AmazonReconcileResult } from "../../../server/amazon-notes.fns";
import scrapeSnippet from "../../../../scripts/amazon-scrape-in-browser.js?raw";
import type { Skill } from "./skills";

export type SkillTaskStatus = "awaiting" | "running" | "done" | "failed";

export type SkillTask = {
  id: string;
  skill: Skill;
  /** Raw text typed after the command, used as a pre-filled target filter. */
  args: string;
  status: SkillTaskStatus;
  result?: AmazonReconcileResult;
  error?: string;
};

export type SkillRunInput = {
  scrapeJson: string;
  targets: string;
  unreviewedOnly: boolean;
};

const AMAZON_PAYMENTS_URL = "https://www.amazon.com/cpe/yourpayments/transactions";

function statusChip(status: SkillTaskStatus) {
  switch (status) {
    case "running":
      return { color: "accent" as const, label: "Running" };
    case "done":
      return { color: "success" as const, label: "Done" };
    case "failed":
      return { color: "danger" as const, label: "Failed" };
    default:
      return { color: "warning" as const, label: "Needs input" };
  }
}

/**
 * In-chat prompt for a skill run.
 *
 * The skill never shells out to an agent: it collects the one input it needs
 * (here the scraped Amazon payment history), calls the server function
 * in-process, and renders the report inline.
 */
export function SkillRunCard({
  task,
  onRun,
  onReset,
  onDismiss,
}: {
  task: SkillTask;
  onRun: (input: SkillRunInput) => void;
  onReset: () => void;
  onDismiss: () => void;
}) {
  const [json, setJson] = useState("");
  const [targets, setTargets] = useState(task.args);
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  const chip = statusChip(task.status);
  const isRunning = task.status === "running";
  const isSettled = task.status === "done" || task.status === "failed";
  const canRun = json.trim().length > 0 && !isRunning;

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(scrapeSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card variant="secondary" className="gap-3 rounded-2xl p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <ShoppingBagIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {task.skill.name}
          </p>
          <p className="truncate font-mono text-xs text-muted">
            {task.skill.command}
          </p>
        </div>
        <Chip size="sm" variant="soft" color={chip.color}>
          {chip.label}
        </Chip>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label="Dismiss skill"
          className="h-6 w-6 shrink-0 rounded-md"
          onPress={onDismiss}
        >
          <XIcon size={12} />
        </Button>
      </div>

      {isSettled ? null : (
        <>
          <ol className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted">
            <li>
              1. Open{" "}
              <Link
                href={AMAZON_PAYMENTS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium"
              >
                Amazon → Your Payments → Transactions
              </Link>{" "}
              while signed in.
            </li>
            <li>
              2. DevTools → Console → paste the scrape snippet, wait for
              “done”.
            </li>
            <li>3. Paste the copied JSON below.</li>
          </ol>

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onPress={copySnippet}>
              {copied ? <CheckIcon size={13} /> : <ClipboardCopyIcon size={13} />}
              {copied ? "Snippet copied" : "Copy scrape snippet"}
            </Button>
          </div>

          <TextField fullWidth className="gap-1.5">
            <Label>Scrape JSON</Label>
            <TextArea
              value={json}
              onChange={(event) => setJson(event.target.value)}
              spellCheck={false}
              rows={5}
              placeholder='{"payments":[…],"orders":[…]}'
              className="min-h-32 resize-y font-mono text-xs"
            />
          </TextField>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <TextField className="w-36 gap-1.5">
              <Label>Targets</Label>
              <Input
                value={targets}
                onChange={(event) => setTargets(event.target.value)}
                placeholder="all"
                className="h-8 text-xs"
              />
            </TextField>

            <Switch
              size="sm"
              isSelected={unreviewedOnly}
              onChange={setUnreviewedOnly}
              className="pb-1.5"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label className="text-xs font-medium">Unreviewed only</Label>
              </Switch.Content>
            </Switch>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="primary"
              isDisabled={!canRun}
              onPress={() =>
                onRun({
                  scrapeJson: json.trim(),
                  targets: targets.trim() || "all",
                  unreviewedOnly,
                })
              }
            >
              {isRunning ? <Spinner size="sm" /> : <ClipboardPasteIcon size={14} />}
              {isRunning ? "Matching…" : "Match & add notes"}
            </Button>
          </div>
        </>
      )}

      {task.status === "running" ? (
        <Text size="xs" variant="muted">
          Reading your Amazon charges and writing notes to matching rows…
        </Text>
      ) : null}

      {task.status === "failed" ? (
        <Alert status="danger" className="gap-3 px-3 py-2.5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title className="text-sm">Could not finish</Alert.Title>
            <Alert.Description className="text-xs">
              {task.error ?? "Unknown error."}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {task.status === "done" && task.result ? (
        <>
          <Alert status="success" className="gap-3 px-3 py-2.5">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title className="text-sm">
                {task.result.updatedCount} note
                {task.result.updatedCount === 1 ? "" : "s"} added
              </Alert.Title>
              <Alert.Description className="text-xs">
                {task.result.matchedCount} matched · {task.result.skippedCount}{" "}
                skipped · {task.result.worklistCount} missing notes
              </Alert.Description>
            </Alert.Content>
          </Alert>

          {task.result.skipped.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-xl bg-default-100/60 px-3 py-2">
              <Text size="xs" variant="muted" className="font-medium">
                Left for you to check
              </Text>
              <ul className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                {task.result.skipped.slice(0, 20).map((skip) => (
                  <li
                    key={skip.transactionId}
                    className="flex gap-2 text-xs text-muted"
                  >
                    <span className="shrink-0 font-mono tabular-nums">
                      #{skip.transactionId}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      ${skip.amount.toFixed(2)}
                    </span>
                    <span className="min-w-0 truncate">{skip.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onPress={onReset}>
              <RotateCcwIcon size={13} />
              Run again
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

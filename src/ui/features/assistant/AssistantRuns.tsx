import {
  Button,
  Card,
  Chip,
  Disclosure,
  EmptyState,
  Text,
} from "@heroui/react";
import {
  CheckCircle2Icon,
  HistoryIcon,
  Loader2Icon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { clearRuns, listRuns, subscribeRuns, type AssistantRun } from "./runs";

function relativeTime(at: number) {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const STATUS = {
  running: {
    label: "Running",
    color: "accent" as const,
    Icon: Loader2Icon,
    iconClass: "animate-spin text-accent",
  },
  failed: {
    label: "Failed",
    color: "danger" as const,
    Icon: TriangleAlertIcon,
    iconClass: "text-danger",
  },
  done: {
    label: "Done",
    color: "success" as const,
    Icon: CheckCircle2Icon,
    iconClass: "text-success",
  },
};

export function AssistantRuns() {
  const [runs, setRuns] = useState<AssistantRun[]>(() => listRuns());

  useEffect(() => subscribeRuns(setRuns), []);

  if (runs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState className="flex max-w-64 flex-col items-center gap-2 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-default-100 text-muted">
            <HistoryIcon size={16} />
          </span>
          <Text size="sm" className="font-semibold text-foreground">
            Nothing has run yet
          </Text>
          <Text size="xs" variant="muted" className="leading-relaxed">
            Skill runs and categorize jobs appear here with their live progress
            and a result summary.
          </Text>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between py-3">
        <Text size="xs" variant="muted" className="font-medium">
          {runs.length} run{runs.length === 1 ? "" : "s"}, newest first
        </Text>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-lg px-2 text-xs"
          onPress={() => clearRuns()}
        >
          <Trash2Icon size={12} />
          Clear
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pb-4">
        {runs.map((run) => {
          const status = STATUS[run.status];
          return (
            <Card key={run.id} variant="secondary" className="gap-2 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <status.Icon size={13} className={status.iconClass} />
                <Text size="sm" className="min-w-0 flex-1 truncate font-semibold">
                  {run.title}
                </Text>
                <Chip size="sm" variant="soft" color={status.color}>
                  {status.label}
                </Chip>
              </div>

              <div className="flex items-center gap-1.5">
                {run.provider ? (
                  <Text size="xs" variant="muted" className="min-w-0 truncate">
                    {run.provider}
                  </Text>
                ) : null}
                <Text size="xs" variant="muted" className="ml-auto shrink-0">
                  {relativeTime(run.startedAt)}
                </Text>
              </div>

              {run.summary ? (
                <Text size="xs" className="leading-relaxed text-foreground">
                  {run.summary}
                </Text>
              ) : null}

              <Disclosure>
                <Disclosure.Heading>
                  <Disclosure.Trigger className="w-full text-left">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                      <Disclosure.Indicator />
                      {run.events.length} event
                      {run.events.length === 1 ? "" : "s"}
                    </span>
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="px-0 pt-2 pb-0">
                    <ul className="flex flex-col gap-1.5">
                      {run.events.map((event, index) => (
                        <li
                          key={`${run.id}-${index}`}
                          className="flex gap-2 text-xs leading-relaxed text-muted"
                        >
                          <span className="shrink-0 font-mono text-xs text-muted/70 tabular-nums">
                            {new Date(event.at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                          <span className="min-w-0 break-words">
                            {event.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

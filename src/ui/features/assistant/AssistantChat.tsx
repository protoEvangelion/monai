import { fetchServerSentEvents } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import {
  Alert,
  Button,
  Card,
  Chip,
  Kbd,
  Spinner,
  Text,
  TextArea,
  TextField,
} from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpIcon,
  CheckIcon,
  SparklesIcon,
  SquareIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { reconcileAmazonNotes } from "../../../server/amazon-notes.fns";
import { showToast } from "../../shared/toast";
import { consumeRequestedSkill, subscribeAssistantRequests } from "./assistantRequest";
import { SkillRunCard, type SkillRunInput, type SkillTask } from "./SkillRunCard";
import { filterSkills, parseSkillDraft, SKILLS, type Skill } from "./skills";

const SUGGESTIONS = [
  {
    label: "Biggest spending last month",
    prompt: "What did I spend the most on last month?",
    icon: TrendingUpIcon,
  },
  {
    label: "Subscription cost",
    prompt: "How much are my subscriptions costing per month?",
    icon: WalletIcon,
  },
];

function useChatConnection() {
  // Created once so the chat client keeps its thread across renders.
  return useMemo(() => fetchServerSentEvents("/api/chat"), []);
}

function AssistantAvatar({ size = 24 }: { size?: number }) {
  return (
    <span
      className="mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 via-blue-500 to-indigo-500 text-white shadow-sm"
      style={{ height: size, width: size }}
    >
      <SparklesIcon size={Math.round(size / 2)} />
    </span>
  );
}

function timeOf(value: Date | number | undefined) {
  if (!value) return -1;
  return typeof value === "number" ? value : value.getTime();
}

export function AssistantChat() {
  const connection = useChatConnection();
  const router = useRouter();
  const reconcile = useServerFn(reconcileAmazonNotes);
  const { messages, sendMessage, status, error, stop } = useChat({
    connection,
    threadId: "monai-assistant",
  });

  const [draft, setDraft] = useState("");
  const [tasks, setTasks] = useState<Array<SkillTask & { createdAt: number }>>([]);
  const [activeSkill, setActiveSkill] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isBusy = status === "streaming" || status === "submitted";

  /** Append a fresh skill card to the thread. */
  const openSkill = (skill: Skill, args = "") => {
    setTasks((current) => [
      ...current,
      {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        skill,
        args,
        status: "awaiting",
        progress: [],
        createdAt: Date.now(),
      },
    ]);
  };

  // Buttons elsewhere (e.g. the dashboard Amazon button) ask for a skill card.
  // Consuming here keeps the panel a dumb view of one in-memory session.
  useEffect(() => {
    const applyRequest = () => {
      const skillId = consumeRequestedSkill();
      const skill = skillId ? SKILLS.find((item) => item.id === skillId) : null;
      if (skill) openSkill(skill);
    };
    applyRequest();
    return subscribeAssistantRequests(applyRequest);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, tasks]);

  // Grow the composer with the draft, up to a readable max height.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }, [draft]);

  /** Slash query: only while the first token is still being typed. */
  const slashQuery =
    draft.startsWith("/") && !/\s/.test(draft) ? draft.slice(1) : null;
  const skillMatches = slashQuery === null ? [] : filterSkills(slashQuery);
  const menuOpen = !menuDismissed && skillMatches.length > 0;

  useEffect(() => setActiveSkill(0), [slashQuery]);

  const chooseSkill = (skill: Skill) => {
    setDraft("");
    setMenuDismissed(true);
    openSkill(skill);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setDraft("");
    void sendMessage(trimmed);
  };

  const patchTask = (
    taskId: string,
    patch: Partial<SkillTask & { createdAt: number }>,
  ) =>
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    );

  /** Progress lines live on the card itself, in the thread. */
  const pushProgress = (taskId: string, line: string) =>
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, progress: [...(task.progress ?? []), line] }
          : task,
      ),
    );

  /** Run a skill card in-process: server function, toast, then refresh rows. */
  const runSkill = async (taskId: string, input: SkillRunInput) => {
    // Validate locally first so a bad paste fails instantly instead of after
    // a round trip, and so the card can report what it actually received.
    let payments = 0;
    let orders = 0;
    try {
      const parsed = JSON.parse(input.scrapeJson) as {
        payments?: unknown[];
        orders?: unknown[];
      };
      payments = Array.isArray(parsed.payments) ? parsed.payments.length : 0;
      orders = Array.isArray(parsed.orders) ? parsed.orders.length : 0;
      if (!payments) throw new Error("No payments found in that JSON.");
    } catch (caught) {
      patchTask(taskId, {
        status: "failed",
        error:
          caught instanceof Error ? caught.message : "Could not read that JSON.",
        result: undefined,
      });
      return;
    }

    patchTask(taskId, {
      status: "running",
      error: undefined,
      result: undefined,
      progress: [
        `Read ${payments} payment${payments === 1 ? "" : "s"} and ${orders} order${
          orders === 1 ? "" : "s"
        } from the scrape`,
      ],
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const output = await (reconcile as any)({ data: input });
      await router.invalidate();

      pushProgress(
        taskId,
        `Matched ${output.matchedCount} · noted ${output.updatedCount} · skipped ${output.skippedCount}`,
      );
      patchTask(taskId, { status: "done", result: output });

      const added = output.updatedCount as number;
      showToast({
        title:
          added > 0
            ? `Added ${added} Amazon note${added === 1 ? "" : "s"}`
            : "No notes added",
        description:
          added > 0
            ? `${output.skippedCount} charge${output.skippedCount === 1 ? "" : "s"} left for you to check.`
            : `Checked ${output.targetedCount} charge${output.targetedCount === 1 ? "" : "s"} against the scrape.`,
        tone: added > 0 ? "default" : "danger",
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not read that JSON.";
      patchTask(taskId, { status: "failed", error: message });
      showToast({ title: "Amazon match failed", description: message, tone: "danger" });
    }
  };

  const resetTask = (taskId: string) =>
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, status: "awaiting", result: undefined, error: undefined }
          : task,
      ),
    );

  const removeTask = (taskId: string) =>
    setTasks((current) => current.filter((task) => task.id !== taskId));

  /** One ordered timeline so local skill cards sit next to model replies. */
  const timeline = useMemo(() => {
    const messageItems = messages.map((message) => ({
      kind: "message" as const,
      key: message.id,
      at: timeOf(message.createdAt),
      message,
    }));
    const taskItems = tasks.map((task) => ({
      kind: "task" as const,
      key: task.id,
      at: task.createdAt,
      task,
    }));
    return [...messageItems, ...taskItems].sort((left, right) => left.at - right.at);
  }, [messages, tasks]);

  const submitDraft = () => {
    const parsed = parseSkillDraft(draft);
    if (parsed) return chooseSkill(parsed.skill);
    // A bare `/word` that matches nothing is not a chat question.
    if (draft.startsWith("/") && !/\s/.test(draft)) return;
    send(draft);
  };

  const onComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSkill((index) => (index + 1) % skillMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSkill(
          (index) => (index - 1 + skillMatches.length) % skillMatches.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const skill = skillMatches[activeSkill];
        if (skill) chooseSkill(skill);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuDismissed(true);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitDraft();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-4"
      >
        {/* Cap the reading measure so wide panels don't stretch lines. */}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {timeline.length === 0 ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold tracking-tight">
                  Ask about your money
                </h3>
                <Text size="xs" variant="muted" className="leading-relaxed">
                  Answers come from your own transactions and accounts, not the
                  model&rsquo;s memory. Type{" "}
                  <span className="rounded-sm bg-default-100 px-1 py-0.5 font-mono font-semibold text-foreground">
                    /
                  </span>{" "}
                  for skills.
                </Text>
              </div>

              <div className="flex flex-col gap-2">
                <Text size="xs" variant="muted" className="font-medium">
                  Try asking
                </Text>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTIONS.map(({ label, prompt, icon: Icon }) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      onPress={() => send(prompt)}
                      className="h-auto justify-start gap-2.5 rounded-xl px-3 py-2.5 text-left"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-default-100 text-muted">
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {label}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {prompt}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Text size="xs" variant="muted" className="font-medium">
                  Skills
                </Text>
                {SKILLS.map((skill) => (
                  <Button
                    key={skill.id}
                    variant="ghost"
                    onPress={() => chooseSkill(skill)}
                    className="h-auto justify-start gap-2.5 rounded-xl px-3 py-2 text-left"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <skill.icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs font-semibold text-foreground">
                        {skill.command}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {skill.description}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {timeline.map((item) => {
            if (item.kind === "task") {
              return (
                <SkillRunCard
                  key={item.key}
                  task={item.task}
                  onRun={(input) => void runSkill(item.task.id, input)}
                  onReset={() => resetTask(item.task.id)}
                  onDismiss={() => removeTask(item.task.id)}
                />
              );
            }

            const message = item.message;
            const text = message.parts
              .map((part) => (part.type === "text" ? part.content : ""))
              .join("")
              .trim();
            const toolCalls = message.parts.filter(
              (part) => part.type === "tool-call",
            );
            if (!text && toolCalls.length === 0) return null;

            if (message.role === "user") {
              return (
                <div key={item.key} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-relaxed font-medium whitespace-pre-wrap text-primary-foreground">
                    {text}
                  </div>
                </div>
              );
            }

            return (
              <div key={item.key} className="flex items-start gap-2.5">
                <AssistantAvatar />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {toolCalls.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {toolCalls.map((part) => (
                        <Chip
                          key={part.id}
                          size="sm"
                          variant="soft"
                          color={part.state === "complete" ? "success" : "accent"}
                        >
                          {part.state === "complete" ? (
                            <CheckIcon size={9} />
                          ) : (
                            <Spinner size="sm" />
                          )}
                          {part.name}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                  {text ? (
                    <div className="rounded-2xl rounded-tl-md bg-default-100 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {text}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {isBusy ? (
            <div className="flex items-center gap-2.5">
              <AssistantAvatar />
              <Chip size="sm" variant="soft" color="accent">
                <Spinner size="sm" />
                Reading your transactions
              </Chip>
            </div>
          ) : null}

          {error ? (
            <Alert status="danger" className="gap-3 px-3 py-2.5">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title className="text-sm">
                  Could not answer that
                </Alert.Title>
                <Alert.Description className="text-xs">
                  {error.message}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitDraft();
        }}
        className="mx-auto w-full max-w-2xl shrink-0 border-t border-divider pt-3"
      >
        <div className="relative">
          {menuOpen ? (
            <Card
              variant="secondary"
              className="absolute bottom-full z-20 mb-2 w-full gap-0 rounded-xl p-1 shadow-lg"
            >
              <span className="px-2 py-1 text-xs font-medium text-muted">
                Skills
              </span>
              {skillMatches.map((skill, index) => (
                <Button
                  key={skill.id}
                  variant="ghost"
                  fullWidth
                  onPress={() => chooseSkill(skill)}
                  onPointerEnter={() => setActiveSkill(index)}
                  className={[
                    "h-auto justify-start gap-2.5 rounded-lg px-2 py-1.5 text-left",
                    index === activeSkill ? "bg-default-100" : "",
                  ].join(" ")}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <skill.icon size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-semibold text-foreground">
                      {skill.command}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {skill.hint}
                    </span>
                  </span>
                </Button>
              ))}
            </Card>
          ) : null}

          <TextField fullWidth>
            <TextArea
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setMenuDismissed(false);
              }}
              onKeyDown={onComposerKeyDown}
              rows={1}
              placeholder="Ask about your spending, or type / for skills…"
              className="max-h-32 min-h-11 resize-none pr-12 text-sm"
            />
          </TextField>

          <div className="absolute top-1.5 right-1.5">
            {isBusy ? (
              <Button
                isIconOnly
                size="sm"
                aria-label="Stop"
                className="h-8 w-8 shrink-0 rounded-lg"
                onPress={() => stop()}
              >
                <SquareIcon size={13} />
              </Button>
            ) : (
              <Button
                isIconOnly
                size="sm"
                variant="primary"
                aria-label="Send"
                isDisabled={!draft.trim()}
                className="h-8 w-8 shrink-0 rounded-lg"
                onPress={() => submitDraft()}
              >
                <ArrowUpIcon size={15} />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 px-1">
          <Text size="xs" variant="muted" className="text-xs">
            <Kbd>
              <Kbd.Content>Enter</Kbd.Content>
            </Kbd>{" "}
            to send,{" "}
            <Kbd>
              <Kbd.Content>Shift</Kbd.Content>
              <Kbd.Content>Enter</Kbd.Content>
            </Kbd>{" "}
            for a new line,{" "}
            <Kbd>
              <Kbd.Content>/</Kbd.Content>
            </Kbd>{" "}
            for skills
          </Text>
        </div>
      </form>
    </div>
  );
}

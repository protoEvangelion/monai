/**
 * Tiny client-side run log for AI jobs (categorize, Amazon reconcile).
 *
 * There is no server-side job table yet, so runs are tracked in memory and
 * mirrored to localStorage. A run is created when a job starts and patched as
 * it progresses, which is what the Assistant panel's Runs tab renders.
 */
export type RunStatus = "running" | "done" | "failed";

export type AssistantRun = {
  id: string;
  /** Short job name, e.g. "AI categorize". */
  title: string;
  /** Model or provider label shown next to the name. */
  provider?: string;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  /** Human-readable progress lines, newest last. */
  events: Array<{ at: number; message: string }>;
  /** One-line outcome shown when the run finishes. */
  summary?: string;
};

const STORAGE_KEY = "monai:assistant-runs";
const EVENT = "monai:assistant-runs";
const MAX_RUNS = 20;

let runs: AssistantRun[] = [];
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as AssistantRun[];
    if (Array.isArray(parsed)) {
      // Anything left "running" from a previous page load is stale.
      runs = parsed.slice(0, MAX_RUNS).map((run) =>
        run.status === "running"
          ? {
              ...run,
              status: "failed" as const,
              summary: run.summary ?? "Interrupted (page reloaded).",
            }
          : run,
      );
    }
  } catch {
    // Corrupt storage is not worth surfacing.
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    // Quota or private mode: the in-memory copy still works for this session.
  }
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: runs }));
}

function commit() {
  runs = runs.slice(0, MAX_RUNS);
  persist();
  emit();
}

export function listRuns() {
  load();
  return runs;
}

export function subscribeRuns(listener: (runs: AssistantRun[]) => void) {
  load();
  if (typeof window === "undefined") return () => {};
  const handler = () => listener(runs);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function startRun(title: string, provider?: string) {
  load();
  const run: AssistantRun = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    provider,
    status: "running",
    startedAt: Date.now(),
    events: [{ at: Date.now(), message: "Started" }],
  };
  runs = [run, ...runs];
  commit();
  return run.id;
}

export function logRunEvent(id: string, message: string) {
  load();
  const run = runs.find((candidate) => candidate.id === id);
  if (!run) return;
  run.events = [...run.events, { at: Date.now(), message }].slice(-40);
  commit();
}

export function finishRun(
  id: string,
  outcome: { status: Exclude<RunStatus, "running">; summary: string },
) {
  load();
  const run = runs.find((candidate) => candidate.id === id);
  if (!run) return;
  run.status = outcome.status;
  run.summary = outcome.summary;
  run.finishedAt = Date.now();
  run.events = [...run.events, { at: Date.now(), message: outcome.summary }].slice(-40);
  commit();
}

export function clearRuns() {
  load();
  runs = [];
  commit();
}

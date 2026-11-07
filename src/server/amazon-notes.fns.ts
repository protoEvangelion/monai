import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { getAuthOrDevAuth } from "../lib/devAuth";

const AGENT_BIN = process.env.CURSOR_CLI_PATH ?? "agent";
const PID_FILE = path.resolve(process.cwd(), "tmp/amazon-notes-agent.pid");
const LOG_FILE = path.resolve(process.cwd(), "tmp/amazon-notes-agent.log");

const PROMPT = [
  "Run the categorize-amazon-transactions skill in this repo (.cursor/skills/categorize-amazon-transactions/SKILL.md).",
  "Scope override from the dashboard Amazon button: only Amazon charges that are not reviewed and have an empty note.",
  "Skip reviewed charges even when their note is empty.",
  "Pass --unreviewed-only to scripts/match-amazon-notes.ts for both --list-targets and the match step.",
  "Do not ask which transactions to use. Start immediately.",
].join(" ");

/**
 * Starts the local Cursor agent and returns immediately. The agent follows the
 * Amazon notes skill: it looks up unreviewed Amazon charges with no note,
 * reads Amazon payment history, and writes the purchase note. The web request
 * does not wait for that work to finish.
 */
export const runAmazonTransactionNotes = createServerFn().handler(async () => {
  if (process.env.VERCEL) {
    throw new Error("Amazon notes only run on your local machine.");
  }

  const { userId } = await getAuthOrDevAuth();
  if (!userId) throw new Error("Unauthorized");

  const runningPid = readLivePid();
  if (runningPid) {
    return { started: false, alreadyRunning: true, pid: runningPid };
  }

  const child = spawn(
    AGENT_BIN,
    [
      "-p",
      "--trust",
      "--force",
      "--approve-mcps",
      "--sandbox",
      "disabled",
      "--workspace",
      process.cwd(),
      "--output-format",
      "text",
    ],
    {
      cwd: process.cwd(),
      env: agentEnv(),
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  if (!child.pid) {
    throw new Error("Could not start the Amazon notes skill.");
  }

  mkdirSync(path.dirname(PID_FILE), { recursive: true });
  const log = createWriteStream(LOG_FILE, { flags: "w" });
  child.once("error", () => {
    clearPid(child.pid);
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  child.stdin?.end(PROMPT);
  writeFileSync(PID_FILE, String(child.pid));
  child.once("close", () => {
    clearPid(child.pid);
  });
  child.unref();

  return { started: true, alreadyRunning: false, pid: child.pid };
});

function agentEnv() {
  const localBin = path.join(os.homedir(), ".local", "bin");
  const pathValue = process.env.PATH ?? "";
  const pathEntries = pathValue.split(path.delimiter);
  if (pathEntries.includes(localBin)) return process.env;
  return { ...process.env, PATH: `${localBin}${path.delimiter}${pathValue}` };
}

function readLivePid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    clearPid(pid);
    return null;
  }
}

function clearPid(pid: number | undefined) {
  if (!existsSync(PID_FILE)) return;
  const current = Number(readFileSync(PID_FILE, "utf8").trim());
  if (pid != null && current !== pid) return;
  unlinkSync(PID_FILE);
}

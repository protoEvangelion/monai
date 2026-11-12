import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { GATEWAY_BASE_URL, gatewayApiKey } from "./aiGateway";

/**
 * Local `pi` CLI categorizer (fallback when the Gateway call fails).
 *
 * This runs the same pi install you use interactively — same provider (Vercel
 * AI Gateway), same model — but with a *dedicated agent directory* so none of
 * your personal config leaks into a batch job:
 *
 *   - no `APPEND_SYSTEM.md` (your greeting/summary rules would corrupt the JSON)
 *   - no user skills, extensions, MCP servers, `AGENTS.md`, or sessions
 *   - `--system-prompt` is Monai's, not pi's coding-assistant prompt
 *
 * The agent dir holds no secrets: `models.json` resolves the key at run time
 * with pi's `"$NAME"` interpolation, and we put the key in the child's env.
 */

export const PI_PROVIDER_ID = "vercel";
export const PI_PROVIDER_LABEL = "pi-cli";

/** Your interactive default (`settings.json` → defaultModel). */
export const PI_CATEGORIZER_MODEL =
  process.env.PI_CATEGORIZER_MODEL?.trim() || "vmc/cheap-flash";

export const PI_MODEL_LABEL = PI_CATEGORIZER_MODEL;

/**
 * Batch categorization is extraction, not reasoning: "minimal" keeps the JSON
 * answer cheap and fast. Override with PI_CATEGORIZER_THINKING.
 */
export const PI_THINKING_LEVEL =
  process.env.PI_CATEGORIZER_THINKING?.trim() || "minimal";

const PI_CLI_PATH = process.env.PI_CLI_PATH?.trim() || "pi";

/**
 * Where `pi` lives when installed with the managed installer.
 *
 * These are functions, not module constants: this module is reachable from
 * client code through the server-function imports, and `node:path` is
 * externalized in the browser bundle. Calling it at module scope crashes the
 * client before hydration.
 */
function piBinDir() {
  return path.join(os.homedir(), ".pi", "agent", "bin");
}

/** Isolated agent dir, so the job never loads your personal pi config. */
function piAgentDir() {
  return path.join(os.tmpdir(), "monai-pi-categorizer");
}

export class PiCategorizerUnavailableError extends Error {
  constructor(message = "pi categorizer is not available.") {
    super(message);
    this.name = "PiCategorizerUnavailableError";
  }
}

export function isPiCategorizerAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Authentication") ||
    message.includes("401") ||
    message.includes("AI_GATEWAY_API_KEY") ||
    message.includes("api key") ||
    message.includes("API key")
  );
}

/** Seconds the local HTTP server should keep this request open while `pi` thinks. */
export function piCategorizerIdleSeconds() {
  const timeoutMs = Number(process.env.PI_CATEGORIZER_TIMEOUT_MS ?? 90_000);
  const cliSeconds = Math.ceil((Number.isFinite(timeoutMs) ? timeoutMs : 90_000) / 1000);
  // Bun's per-request cap is 255 seconds. Leave a little room after `pi` gives up.
  return Math.min(255, cliSeconds + 15);
}

/**
 * A pi agent dir that mirrors your provider/model setup but none of your
 * prompts. Written once per process change and reused after that.
 */
function writeAgentDir() {
  const agentDir = piAgentDir();
  fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });

  const models = {
    $schema: "https://pi.dev/schemas/models.schema.json",
    providers: {
      [PI_PROVIDER_ID]: {
        name: "Vercel AI Gateway",
        baseUrl: GATEWAY_BASE_URL,
        api: "openai-responses",
        // Resolved by pi from the child env — never written to disk.
        apiKey: "$AI_GATEWAY_API_KEY",
        authHeader: true,
        models: [
          {
            id: PI_CATEGORIZER_MODEL,
            name: PI_CATEGORIZER_MODEL,
            reasoning: true,
            input: ["text"],
            contextWindow: 1_048_576,
            maxTokens: 262_144,
          },
        ],
      },
    },
  };

  const settings = {
    defaultProvider: PI_PROVIDER_ID,
    defaultModel: PI_CATEGORIZER_MODEL,
    defaultThinkingLevel: PI_THINKING_LEVEL,
    packages: [],
  };

  const write = (name: string, value: unknown) => {
    const file = path.join(agentDir, name);
    const next = `${JSON.stringify(value, null, 2)}\n`;
    try {
      if (fs.readFileSync(file, "utf8") === next) return;
    } catch {
      // Missing file: fall through and write it.
    }
    fs.writeFileSync(file, next, { mode: 0o600 });
  };

  write("models.json", models);
  write("settings.json", settings);
}

function piCliEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // `models.json` interpolates this name, so fix it to the resolved key
  // whether it came from AI_GATEWAY_API_KEY or Vercel OIDC.
  env.AI_GATEWAY_API_KEY = gatewayApiKey();
  env.PI_CODING_AGENT_DIR = piAgentDir();

  const binDir = piBinDir();
  const pathEntries = (env.PATH ?? "").split(path.delimiter);
  if (fs.existsSync(binDir) && !pathEntries.includes(binDir)) {
    env.PATH = `${binDir}${path.delimiter}${env.PATH ?? ""}`;
  }

  return env;
}

function extractPiResult(stdout: string, stderr: string) {
  const text = stdout.trim();
  if (text) return text;
  // `pi -p` writes the final assistant text to stdout; stderr is diagnostics.
  return stderr.trim();
}

export async function runPiCategorizerCli({
  maxBuffer = 1024 * 1024 * 4,
  prompt,
  systemPrompt,
}: {
  maxBuffer?: number;
  prompt: string;
  /** Replaces pi's coding-assistant prompt (never your APPEND_SYSTEM.md). */
  systemPrompt: string;
}) {
  writeAgentDir();

  const { spawn } = await import("node:child_process");
  const timeoutMs = Number(process.env.PI_CATEGORIZER_TIMEOUT_MS ?? 90_000);

  const args = [
    "-p",
    "--mode",
    "text",
    "--thinking",
    PI_THINKING_LEVEL,
    "--model",
    PI_CATEGORIZER_MODEL,
    "--system-prompt",
    systemPrompt,
    // Stay a one-shot text generator: no tools, no repo context, no session.
    "--no-session",
    "--no-tools",
    "--no-extensions",
    "--no-skills",
    "--no-mcp",
    "--no-context-files",
  ];

  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(PI_CLI_PATH, args, {
        env: piCliEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let bufferExceeded = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      const appendOutput = (stream: "stdout" | "stderr", chunk: Buffer) => {
        if (stream === "stdout") stdout += chunk.toString("utf8");
        else stderr += chunk.toString("utf8");

        if (stdout.length + stderr.length > maxBuffer) {
          bufferExceeded = true;
          child.kill("SIGTERM");
        }
      };

      child.stdout.on("data", (chunk: Buffer) => appendOutput("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => appendOutput("stderr", chunk));
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(
          new PiCategorizerUnavailableError(
            `Could not start \`${PI_CLI_PATH}\`. Install pi or set PI_CLI_PATH.\n${error.message}`,
          ),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new Error(`pi categorizer timed out after ${timeoutMs}ms.`));
          return;
        }

        if (bufferExceeded) {
          reject(new Error(`pi categorizer output exceeded ${maxBuffer} bytes.`));
          return;
        }

        if (code !== 0) {
          const failure = new Error(
            [
              `pi categorizer exited with code ${code}.`,
              stderr ? `stderr:\n${preview(stderr, 2_000)}` : null,
              stdout ? `stdout:\n${preview(stdout, 2_000)}` : null,
              "Check `pi auth check --model " + PI_CATEGORIZER_MODEL + "` and AI_GATEWAY_API_KEY.",
            ]
              .filter(Boolean)
              .join("\n"),
          );
          if (isPiCategorizerAuthError(failure)) {
            reject(new PiCategorizerUnavailableError(failure.message));
            return;
          }
          reject(failure);
          return;
        }

        resolve({ stdout, stderr });
      });

      child.stdin.end(prompt);
    },
  );

  return extractPiResult(stdout, stderr);
}

function preview(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

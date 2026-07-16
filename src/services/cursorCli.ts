import os from "node:os";
import path from "node:path";

export const CURSOR_CATEGORIZER_MODEL = process.env.CURSOR_CATEGORIZER_MODEL;
export const CURSOR_MODEL_LABEL = CURSOR_CATEGORIZER_MODEL ?? "cursor-default";
export const CURSOR_PROVIDER_LABEL = "cursor-cli";

const CURSOR_CLI_PATH = process.env.CURSOR_CLI_PATH ?? "agent";

function cursorCliEnv() {
  const localBin = path.join(os.homedir(), ".local", "bin");
  const pathValue = process.env.PATH ?? "";
  const pathEntries = pathValue.split(path.delimiter);
  if (!pathEntries.includes(localBin)) {
    return { ...process.env, PATH: `${localBin}${path.delimiter}${pathValue}` };
  }
  return process.env;
}

function extractCursorCliResult(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) return trimmed;

  try {
    const envelope = JSON.parse(trimmed) as { result?: unknown };
    if (typeof envelope.result === "string") return envelope.result;
  } catch {
    // Fall back to raw stdout when the CLI does not emit the JSON envelope.
  }

  return trimmed;
}

export async function runCursorCategorizerCli({
  maxBuffer = 1024 * 1024 * 4,
  prompt,
}: {
  maxBuffer?: number;
  prompt: string;
}) {
  const { spawn } = await import("node:child_process");

  const timeoutMs = Number(process.env.CURSOR_CATEGORIZER_TIMEOUT_MS ?? 90_000);

  const { stdout, stderr } = await new Promise<{
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      CURSOR_CLI_PATH,
      [
        "-p",
        "--mode",
        "ask",
        "--output-format",
        "json",
        "--trust",
        "--sandbox",
        "enabled",
        ...(CURSOR_CATEGORIZER_MODEL ? ["--model", CURSOR_CATEGORIZER_MODEL] : []),
      ],
      {
        env: cursorCliEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

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
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Cursor categorizer timed out after ${timeoutMs}ms.`));
        return;
      }

      if (bufferExceeded) {
        reject(new Error(`Cursor categorizer output exceeded ${maxBuffer} bytes.`));
        return;
      }

      if (code !== 0) {
        reject(
          new Error(
            [
              `Cursor categorizer exited with code ${code}.`,
              stderr ? `stderr:\n${preview(stderr, 2_000)}` : null,
              stdout ? `stdout:\n${preview(stdout, 2_000)}` : null,
              "Run `agent login` or set CURSOR_API_KEY if authentication fails.",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });

    child.stdin.end(prompt);
  });

  return extractCursorCliResult(stdout || stderr).trim();
}

function preview(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

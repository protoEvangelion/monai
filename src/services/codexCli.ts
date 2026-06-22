export const CODEX_CATEGORIZER_MODEL = process.env.CODEX_CATEGORIZER_MODEL;
export const CODEX_MODEL_LABEL = CODEX_CATEGORIZER_MODEL ?? "codex-default";
export const CODEX_PROVIDER_LABEL = "codex-cli";

const CODEX_CLI_PATH = process.env.CODEX_CLI_PATH ?? "codex";

export async function runCodexCategorizerCli({
  maxBuffer = 1024 * 1024 * 4,
  prompt,
  schema,
  tempPrefix,
}: {
  maxBuffer?: number;
  prompt: string;
  schema: Record<string, unknown>;
  tempPrefix: string;
}) {
  const [{ spawn }, fs, os, path] = await Promise.all([
    import("node:child_process"),
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
  ]);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), tempPrefix));
  const outputPath = path.join(tempDir, "response.txt");
  const schemaPath = path.join(tempDir, "schema.json");

  await fs.writeFile(schemaPath, JSON.stringify(schema));

  try {
    const { stdout, stderr } = await new Promise<{
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const timeoutMs = Number(process.env.CODEX_CATEGORIZER_TIMEOUT_MS ?? 90_000);
      const child = spawn(
        CODEX_CLI_PATH,
        [
          "exec",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "--ignore-rules",
          "--color",
          "never",
          "--output-last-message",
          outputPath,
          "--output-schema",
          schemaPath,
          ...(CODEX_CATEGORIZER_MODEL ? ["--model", CODEX_CATEGORIZER_MODEL] : []),
          "-",
        ],
        {
          env: {
            ...process.env,
            NO_COLOR: "1",
          },
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
          reject(new Error(`Codex categorizer timed out after ${timeoutMs}ms.`));
          return;
        }

        if (bufferExceeded) {
          reject(new Error(`Codex categorizer output exceeded ${maxBuffer} bytes.`));
          return;
        }

        if (code !== 0) {
          reject(
            new Error(
              [
                `Codex categorizer exited with code ${code}.`,
                stderr ? `stderr:\n${preview(stderr, 2_000)}` : null,
                stdout ? `stdout:\n${preview(stdout, 2_000)}` : null,
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

    const finalResponse = await fs.readFile(outputPath, "utf8").catch(() => "");
    return (finalResponse || `${stdout}\n${stderr}`).trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function preview(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

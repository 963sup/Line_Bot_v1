import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Input = {
  artifactDir?: string;
  command: string[];
  dedupeKey?: string;
  label: string;
  tailLines?: number;
};

type Result = {
  artifact: string;
  changed: boolean;
  durationMs: number;
  exitCode: number;
  firstActionableError?: string;
  label: string;
  ok: boolean;
  outputLines: number;
  tail: string[];
};

type CompletedProcess = {
  exitCode: number;
  output: string;
};

const defaultArtifactDir = resolve(process.cwd(), ".artifacts", "bounded-command");
const defaultTailLines = 30;
const actionableError = /\b(?:error|exception|failed|failure|assertion)\b/i;

function safeLabel(label: string): string {
  const normalized = label.replaceAll(/[^a-zA-Z0-9._-]+/g, "-").replaceAll(/^-+|-+$/g, "");
  if (!normalized) throw new Error("label must contain a letter or number");
  return normalized;
}

function nonEmptyLines(output: string): string[] {
  return output.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

async function execute(command: string[]): Promise<CompletedProcess> {
  if (command.length === 0) throw new Error("command is required after --");

  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      const suffix = signal ? `\nProcess terminated by signal ${signal}\n` : "";
      resolvePromise({ exitCode: code ?? 1, output: `${stdout}${stderr}${suffix}` });
    });
  });
}

async function readState(path: string): Promise<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== "string")
    ) {
      throw new Error(`Invalid bounded-command state: ${path}`);
    }
    return parsed;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return {};
    throw error;
  }
}

async function writeState(path: string, state: Record<string, string>): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function runBoundedCommand(input: Input): Promise<Result> {
  const label = safeLabel(input.label);
  const artifactDir = resolve(input.artifactDir ?? defaultArtifactDir);
  const tailLines = input.tailLines ?? defaultTailLines;
  if (!Number.isSafeInteger(tailLines) || tailLines < 1) {
    throw new Error("tailLines must be a positive integer");
  }

  await mkdir(artifactDir, { recursive: true });
  const startedAt = Date.now();
  const completed = await execute(input.command);
  const outputLines = nonEmptyLines(completed.output);
  const artifact = join(artifactDir, `${label}-${startedAt}-${process.pid}.log`);
  await writeFile(artifact, completed.output, "utf8");

  const ok = completed.exitCode === 0;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        command: input.command,
        exitCode: completed.exitCode,
        output: completed.output,
      }),
    )
    .digest("hex");
  let changed = true;
  if (input.dedupeKey) {
    const statePath = join(artifactDir, "state.json");
    const state = await readState(statePath);
    changed = state[input.dedupeKey] !== fingerprint;
    state[input.dedupeKey] = fingerprint;
    await writeState(statePath, state);
  }

  return {
    artifact,
    changed,
    durationMs: Date.now() - startedAt,
    exitCode: completed.exitCode,
    ...(ok
      ? { tail: [] }
      : {
          firstActionableError: outputLines.find((line) => actionableError.test(line)),
          tail: outputLines.slice(-tailLines),
        }),
    label,
    ok,
    outputLines: outputLines.length,
  };
}

function printHelp(): void {
  console.log(`Usage: pnpm tool:bounded -- --label <name> [options] -- <command> [args...]

Options:
  --artifact-dir <path>  Directory for full logs (default: .artifacts/bounded-command)
  --dedupe-key <key>     Mark unchanged identical outcomes as changed=false
  --tail-lines <count>   Failure tail line limit (default: 30)
`);
}

function parseCli(argv: string[]): Input | "help" {
  if (argv[0] === "--") argv = argv.slice(1);
  let artifactDir: string | undefined;
  let dedupeKey: string | undefined;
  let label: string | undefined;
  let tailLines: number | undefined;
  let index = 0;
  while (index < argv.length && argv[index] !== "--") {
    const option = argv[index++];
    if (option === "--help" || option === "-h") return "help";
    const value = argv[index++];
    if (!value) throw new Error(`Missing value for ${option}`);
    if (option === "--artifact-dir") artifactDir = value;
    else if (option === "--dedupe-key") dedupeKey = value;
    else if (option === "--label") label = value;
    else if (option === "--tail-lines") tailLines = Number(value);
    else throw new Error(`Unknown option: ${option}`);
  }
  if (argv[index] !== "--") throw new Error("Use -- before the command");
  if (!label) throw new Error("--label is required");
  return { artifactDir, command: argv.slice(index + 1), dedupeKey, label, tailLines };
}

async function main(): Promise<void> {
  const input = parseCli(process.argv.slice(2));
  if (input === "help") {
    printHelp();
    return;
  }
  const result = await runBoundedCommand(input);
  console.log(JSON.stringify({ ...result, artifact: relative(process.cwd(), result.artifact) }));
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

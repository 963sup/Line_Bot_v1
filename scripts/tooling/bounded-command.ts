import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { pathToFileURL } from "node:url";

type Input = {
  artifactDir?: string;
  command: string[];
  dedupeKey?: string;
  label: string;
  selectors?: string[];
  summaryMode?: "gh-pr-checks" | "json";
  tailLines?: number;
};

type GhPrChecksSummary = {
  failed: string[];
  failing: number;
  passing: number;
  pending: number;
  total: number;
};

type JsonSummary = {
  kind: "json";
  root: "array" | "object" | "primitive";
  selected?: Record<string, unknown>;
  topLevelKeys?: string[];
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
  summary?: GhPrChecksSummary | JsonSummary;
  tail: string[];
};

type CompletedProcess = {
  exitCode: number;
  failure: { firstActionableError?: string; tail: string[] };
  outputHash: string;
  outputLines: number;
  stdoutForSummary?: string;
};

const defaultArtifactDir = resolve(process.cwd(), ".artifacts", "bounded-command");
const defaultTailLines = 30;
const actionableError = /\b(?:error|exception|failed|failure|assertion)\b/i;
const maxFailureExcerptChars = 4096;
const maxLineExcerptChars = 1024;
const maxSummaryChars = 1024 * 1024;

export function summarizeGhPrChecks(output: string): GhPrChecksSummary | undefined {
  const summary: GhPrChecksSummary = { failed: [], failing: 0, passing: 0, pending: 0, total: 0 };
  for (const line of output.split(/\r?\n/)) {
    const [name, status] = line.split("\t", 3);
    if (!name || !status) continue;
    summary.total += 1;
    if (status === "pass") summary.passing += 1;
    else if (status === "pending") summary.pending += 1;
    else if (status === "fail") {
      summary.failing += 1;
      summary.failed.push(name);
    }
  }
  return summary.total > 0 ? summary : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rootKind(value: unknown): JsonSummary["root"] {
  if (Array.isArray(value)) return "array";
  if (isRecord(value)) return "object";
  return "primitive";
}

function safeJsonValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 256);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return { count: value.length };
  if (isRecord(value)) return { keys: Object.keys(value).sort().slice(0, 40) };
  return String(value).slice(0, 256);
}

function selectJson(value: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown[] = [value];
  let traversedArray = false;
  for (const segment of segments) {
    const isArray = segment.endsWith("[]");
    const key = isArray ? segment.slice(0, -2) : segment;
    if (!key) throw new Error(`Invalid JSON selector: ${path}`);
    const next: unknown[] = [];
    for (const candidate of current) {
      if (!isRecord(candidate) || !(key in candidate)) continue;
      const child = candidate[key];
      if (isArray) {
        if (!Array.isArray(child)) continue;
        traversedArray = true;
        next.push(...child);
      } else {
        next.push(child);
      }
    }
    current = next;
  }
  if (traversedArray) {
    return { count: current.length, values: current.slice(0, 10).map(safeJsonValue) };
  }
  return current.length === 0 ? undefined : safeJsonValue(current[0]);
}

export function summarizeJsonResponse(
  output: string,
  selectors: string[] = [],
): JsonSummary | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  const selected = Object.fromEntries(
    selectors.map((selector) => [selector, selectJson(parsed, selector)]),
  );
  return {
    kind: "json",
    root: rootKind(parsed),
    ...(Object.keys(selected).length > 0 ? { selected } : {}),
    ...(isRecord(parsed) ? { topLevelKeys: Object.keys(parsed).sort().slice(0, 40) } : {}),
  };
}

function safeLabel(label: string): string {
  const normalized = label.replaceAll(/[^a-zA-Z0-9._-]+/g, "-").replaceAll(/^-+|-+$/g, "");
  if (!normalized) throw new Error("label must contain a letter or number");
  return normalized;
}

function clipExcerpt(line: string): string {
  return line.length > maxLineExcerptChars
    ? `${line.slice(0, maxLineExcerptChars)}…[truncated]`
    : line;
}

class BoundedCapture {
  #firstActionableError: string | undefined;
  #hash = createHash("sha256");
  #lineBuffers = new Map<string, string>();
  #outputLines = 0;
  #stdoutForSummary = "";
  #summaryTooLarge = false;
  #tail: string[] = [];

  constructor(private readonly tailLines: number) {}

  append(stream: "stdout" | "stderr", chunk: string): void {
    this.#hash.update(chunk);
    if (stream === "stdout" && !this.#summaryTooLarge) {
      if (this.#stdoutForSummary.length + chunk.length > maxSummaryChars) {
        this.#stdoutForSummary = "";
        this.#summaryTooLarge = true;
      } else {
        this.#stdoutForSummary += chunk;
      }
    }
    const buffer = `${this.#lineBuffers.get(stream) ?? ""}${chunk}`;
    const lines = buffer.split(/\r?\n/);
    this.#lineBuffers.set(stream, lines.pop() ?? "");
    for (const line of lines) this.#recordLine(line);
  }

  finish(): void {
    for (const line of this.#lineBuffers.values()) this.#recordLine(line);
    this.#lineBuffers.clear();
  }

  result(): Omit<CompletedProcess, "exitCode"> {
    return {
      failure: { firstActionableError: this.#firstActionableError, tail: this.#tail },
      outputHash: this.#hash.digest("hex"),
      outputLines: this.#outputLines,
      ...(this.#summaryTooLarge ? {} : { stdoutForSummary: this.#stdoutForSummary }),
    };
  }

  #recordLine(line: string): void {
    if (!line.trim()) return;
    this.#outputLines += 1;
    const excerpt = clipExcerpt(line);
    if (!this.#firstActionableError && actionableError.test(excerpt)) {
      this.#firstActionableError = excerpt;
    }
    this.#tail.push(excerpt);
    while (
      this.#tail.length > this.tailLines ||
      this.#tail.join("\n").length > maxFailureExcerptChars
    ) {
      this.#tail.shift();
    }
  }
}

async function execute(
  command: string[],
  artifact: string,
  tailLines: number,
): Promise<CompletedProcess> {
  if (command.length === 0) throw new Error("command is required after --");

  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    const artifactStream = createWriteStream(artifact, { encoding: "utf8" });
    const capture = new BoundedCapture(tailLines);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.pipe(artifactStream, { end: false });
    child.stderr.pipe(artifactStream, { end: false });
    child.stdout.on("data", (chunk: string) => {
      capture.append("stdout", chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      capture.append("stderr", chunk);
    });
    child.once("error", reject);
    artifactStream.once("error", reject);
    child.once("close", async (code, signal) => {
      if (signal) capture.append("stderr", `\nProcess terminated by signal ${signal}\n`);
      capture.finish();
      artifactStream.end();
      try {
        await finished(artifactStream);
        resolvePromise({ exitCode: code ?? 1, ...capture.result() });
      } catch (error) {
        reject(error);
      }
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
  const artifact = join(artifactDir, `${label}-${startedAt}-${process.pid}.log`);
  const completed = await execute(input.command, artifact, tailLines);

  const summary =
    input.summaryMode === "gh-pr-checks"
      ? completed.stdoutForSummary && summarizeGhPrChecks(completed.stdoutForSummary)
      : input.summaryMode === "json"
        ? completed.stdoutForSummary &&
          summarizeJsonResponse(completed.stdoutForSummary, input.selectors)
        : undefined;
  const ok =
    completed.exitCode === 0 || (input.summaryMode === "gh-pr-checks" && summary !== undefined);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        command: input.command,
        exitCode: completed.exitCode,
        outputHash: completed.outputHash,
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
    ...(ok || !changed
      ? { tail: [] }
      : {
          ...completed.failure,
        }),
    label,
    ok,
    outputLines: completed.outputLines,
    ...(summary ? { summary } : {}),
  };
}

function printHelp(): void {
  console.log(`Usage: pnpm tool:bounded -- --label <name> [options] -- <command> [args...]

Options:
  --artifact-dir <path>  Directory for full logs (default: .artifacts/bounded-command)
  --dedupe-key <key>     Mark unchanged identical outcomes as changed=false
  --summary <mode>       Structured summary mode: gh-pr-checks, json
  --select <path>        JSON selector; repeat or separate paths with commas
  --tail-lines <count>   Failure tail line limit (default: 30)
`);
}

function parseCli(argv: string[]): Input | "help" {
  if (argv[0] === "--") argv = argv.slice(1);
  let artifactDir: string | undefined;
  let dedupeKey: string | undefined;
  let label: string | undefined;
  const selectors: string[] = [];
  let summaryMode: Input["summaryMode"];
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
    else if (option === "--summary") {
      if (value !== "gh-pr-checks" && value !== "json") {
        throw new Error(`Unknown summary mode: ${value}`);
      }
      summaryMode = value;
    } else if (option === "--select") {
      selectors.push(...value.split(",").filter(Boolean));
    } else if (option === "--tail-lines") tailLines = Number(value);
    else throw new Error(`Unknown option: ${option}`);
  }
  if (argv[index] !== "--") throw new Error("Use -- before the command");
  if (!label) throw new Error("--label is required");
  return {
    artifactDir,
    command: argv.slice(index + 1),
    dedupeKey,
    label,
    selectors,
    summaryMode,
    tailLines,
  };
}

async function main(): Promise<void> {
  const input = parseCli(process.argv.slice(2));
  if (input === "help") {
    printHelp();
    return;
  }
  const result = await runBoundedCommand(input);
  const response = result.changed
    ? result
    : {
        artifact: result.artifact,
        changed: false,
        exitCode: result.exitCode,
        label: result.label,
        ok: result.ok,
      };
  console.log(
    JSON.stringify({ ...response, artifact: relative(process.cwd(), response.artifact) }),
  );
  process.exitCode = result.ok ? 0 : result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

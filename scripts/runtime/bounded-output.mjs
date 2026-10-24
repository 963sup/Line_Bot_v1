import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const diagnosticLimits = Object.freeze({ maxBytes: 24 * 1024, maxLines: 120 });

function safeLabel(label) {
  return label.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function createOutputDirectory(root, prefix = "validation-") {
  const artifacts = join(root, ".artifacts");
  mkdirSync(artifacts, { recursive: true });
  return mkdtempSync(join(artifacts, prefix));
}

export function writeBoundedDiagnostic(outputDirectory, label, content) {
  const logPath = join(outputDirectory, `${safeLabel(label)}.log`);
  writeFileSync(logPath, content);
  return { logPath, diagnostic: readBoundedTail(logPath) };
}

function readBoundedTail(
  path,
  { maxBytes = diagnosticLimits.maxBytes, maxLines = diagnosticLimits.maxLines } = {},
) {
  const size = statSync(path).size;
  const length = Math.min(size, maxBytes);
  const buffer = Buffer.alloc(length);
  const descriptor = openSync(path, "r");
  try {
    readSync(descriptor, buffer, 0, length, size - length);
  } finally {
    closeSync(descriptor);
  }
  const content = buffer.toString("utf8");
  const lines = content.split(/\r?\n/);
  const tail = lines.slice(-maxLines).join("\n").trim();
  return size > maxBytes || lines.length > maxLines ? `[output truncated]\n${tail}` : tail;
}

export function runBoundedCommand(
  file,
  args,
  { cwd, env, label, outputDirectory, spawn = spawnSync } = {},
) {
  const logPath = join(outputDirectory, `${safeLabel(label)}.log`);
  const descriptor = openSync(logPath, "w");
  let result;
  try {
    result = spawn(file, args, { cwd, env, stdio: ["ignore", descriptor, descriptor] });
  } finally {
    closeSync(descriptor);
  }
  return {
    ...result,
    logPath,
    diagnostic: result?.error || result?.status !== 0 ? readBoundedTail(logPath) : "",
  };
}

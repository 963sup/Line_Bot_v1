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

const diagnosticLimits = Object.freeze({ maxBytes: 8 * 1024, maxLines: 80 });
const truncationMarker = "[output truncated]";

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
  return {
    artifactBytes: statSync(logPath).size,
    diagnostic: readBoundedTail(logPath),
    logPath,
  };
}

function utf8Tail(content, maxBytes) {
  const characters = Array.from(content);
  let start = characters.length;
  let bytes = 0;
  while (start > 0) {
    const next = Buffer.byteLength(characters[start - 1]);
    if (bytes + next > maxBytes) break;
    bytes += next;
    start -= 1;
  }
  return characters.slice(start).join("");
}

export function readBoundedTail(
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
  const truncated = size > maxBytes || lines.length > maxLines;
  const tail = lines
    .slice(-(maxLines - Number(truncated)))
    .join("\n")
    .trim();
  if (!truncated) return tail;

  const prefix = `${truncationMarker}\n`;
  return `${prefix}${utf8Tail(tail, maxBytes - Buffer.byteLength(prefix))}`;
}

export function boundedSpawnOptions(outputDirectory, label) {
  const logPath = join(outputDirectory, `${safeLabel(label)}.log`);
  const descriptor = openSync(logPath, "w");
  let closed = false;
  return {
    logPath,
    stdio: ["ignore", descriptor, descriptor],
    close() {
      if (!closed) {
        closeSync(descriptor);
        closed = true;
      }
    },
  };
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
    artifactBytes: statSync(logPath).size,
    logPath,
    diagnostic: result?.error || result?.status !== 0 ? readBoundedTail(logPath) : "",
  };
}

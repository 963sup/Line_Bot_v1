import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
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

function utf8Head(content, maxBytes) {
  const characters = Array.from(content);
  let end = 0;
  let bytes = 0;
  while (end < characters.length) {
    const next = Buffer.byteLength(characters[end]);
    if (bytes + next > maxBytes) break;
    bytes += next;
    end += 1;
  }
  return characters.slice(0, end).join("");
}

function boundFailureExcerpt(content, { maxBytes, maxLines }) {
  const lines = content.trim().split(/\r?\n/);
  const lineTruncated = lines.length > maxLines;
  const lineBounded = lineTruncated ? [...lines.slice(0, maxLines - 1), truncationMarker] : lines;
  const joined = lineBounded.join("\n");
  if (Buffer.byteLength(joined) <= maxBytes) return joined;
  const suffix = `\n${truncationMarker}`;
  return `${utf8Head(joined, maxBytes - Buffer.byteLength(suffix))}${suffix}`;
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

/** Preserve the first actionable compiler/provider errors before the final summary. */
export function readBoundedFailure(path, options = {}) {
  const { maxBytes = diagnosticLimits.maxBytes, maxLines = diagnosticLimits.maxLines } = options;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const matchIndexes = lines
    .map((line, index) =>
      /error|failed|module not found|cannot find|not found/i.test(line) ? index : -1,
    )
    .filter((index) => index >= 0)
    .slice(0, maxLines);
  if (!matchIndexes.length) return readBoundedTail(path, options);

  const selected = new Set();
  for (const index of matchIndexes) {
    for (let offset = -1; offset <= 1; offset += 1) {
      const candidate = index + offset;
      if (candidate >= 0 && candidate < lines.length) selected.add(candidate);
    }
  }
  const excerpt = [...selected]
    .sort((left, right) => left - right)
    .map((index) => lines[index])
    .join("\n");
  return boundFailureExcerpt(excerpt, { maxBytes, maxLines });
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

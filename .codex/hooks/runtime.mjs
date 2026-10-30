import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function context(event) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: event.cwd,
    encoding: "utf8",
    timeout: 3000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!event.session_id) throw new Error("Hook event has no session_id");
  const base = resolve(root, ".artifacts", "hooks", digest(event.session_id));
  return { root, base, turn: event.turn_id ? resolve(base, digest(event.turn_id)) : null };
}

export function save(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}

export function patchPaths(command, cwd, root) {
  const paths = new Set();
  for (const match of command.matchAll(
    /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm,
  )) {
    const path = relative(root, resolve(cwd, match[1])).replaceAll("\\", "/");
    if (!path || path === ".." || path.startsWith("../") || isAbsolute(path)) continue;
    if (/^(?:\.git|\.artifacts|\.tools|\.cache|node_modules)(?:\/|$)/.test(path)) continue;
    paths.add(path);
  }
  return [...paths].sort();
}

export function fingerprint(root, paths) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    timeout: 3000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return digest(
    JSON.stringify([
      revision,
      paths.map((path) => {
        try {
          return [path, digest(readFileSync(resolve(root, path)))];
        } catch (error) {
          if (error.code === "ENOENT") return [path, null];
          throw error;
        }
      }),
    ]),
  );
}

export function run(handler) {
  try {
    const event = JSON.parse(readFileSync(0, "utf8"));
    const result = handler(event);
    console.log(JSON.stringify(result ?? {}));
  } catch {
    console.log(
      JSON.stringify({
        systemMessage:
          "Repository hook could not run; verification remains unverified. Run the applicable pnpm check stages manually.",
      }),
    );
  }
}

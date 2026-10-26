import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasOnlyKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function validatePlan(plan) {
  if (!hasOnlyKeys(plan, ["version", "objective", "changes"]))
    fail("Plan must contain only version, objective, and changes.");
  if (plan.version !== 1 || typeof plan.objective !== "string" || !Array.isArray(plan.changes))
    fail("Plan must use version 1 with a string objective and changes array.");

  const paths = new Set();
  for (const [index, change] of plan.changes.entries()) {
    if (!hasOnlyKeys(change, ["path", "sha256", "before", "after"]))
      fail(`changes[${index}] must contain only path, sha256, before, and after.`);
    if (
      typeof change.path !== "string" ||
      typeof change.sha256 !== "string" ||
      typeof change.before !== "string" ||
      typeof change.after !== "string"
    )
      fail(`changes[${index}] fields must be strings.`);
    if (!change.before) fail(`changes[${index}].before must not be empty.`);
    if (change.before === change.after) fail(`changes[${index}].after must differ from before.`);
    if (!/^[a-f0-9]{64}$/.test(change.sha256))
      fail(`changes[${index}].sha256 must be a lowercase SHA-256 hex digest.`);
    const pathKey = change.path.toLocaleLowerCase("en-US");
    if (paths.has(pathKey)) fail(`Each file may appear only once: ${change.path}`);
    paths.add(pathKey);
  }
}

function resolveWorkspaceFile(root, path) {
  if (
    !path ||
    path.includes("\\") ||
    path.includes(":") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    // Windows normalizes trailing dots/spaces into aliases of other files.
    path.split("/").some((part) => !part || /[. ]$/.test(part))
  )
    fail(`Invalid workspace path: ${path}`);
  const segments = path.split("/");
  if (segments.some((part) => [".git", "node_modules"].includes(part.toLocaleLowerCase("en-US"))))
    fail(`Protected workspace path: ${path}`);
  if (segments.some((part) => /^\.env(?:\.|$)/i.test(part)))
    fail(`Environment files are protected: ${path}`);

  const rootPath = resolve(root);
  const candidate = resolve(rootPath, ...segments);
  const outside = relative(rootPath, candidate);
  if (
    outside === "" ||
    outside === ".." ||
    outside.startsWith(`..${sep}`) ||
    /^(?:[A-Za-z]:)?[\\/]/.test(outside)
  )
    fail(`Path escapes workspace: ${path}`);

  let current = rootPath;
  for (const segment of segments) {
    current = resolve(current, segment);
    let entry;
    try {
      entry = lstatSync(current);
    } catch {
      fail(`Path must name an existing regular file: ${path}`);
    }
    if (entry.isSymbolicLink()) fail(`Symlink traversal is not allowed: ${path}`);
  }
  if (!lstatSync(candidate).isFile()) fail(`Path must name a regular file: ${path}`);
  return candidate;
}

function inspectChange(root, change) {
  const file = resolveWorkspaceFile(root, change.path);
  const bytes = readFileSync(file);
  if (!isUtf8(bytes)) fail(`File must be UTF-8 text: ${change.path}`);
  const actualHash = sha256(bytes);
  if (actualHash !== change.sha256) fail(`SHA-256 mismatch: ${change.path}`);
  const source = bytes.toString("utf8");
  let beforeCount = 0;
  for (
    let index = source.indexOf(change.before);
    index !== -1;
    index = source.indexOf(change.before, index + 1)
  )
    beforeCount += 1;
  if (beforeCount !== 1)
    fail(`before must occur exactly once in ${change.path}; found ${beforeCount}.`);
  return {
    path: change.path,
    file,
    bytes,
    sha256: change.sha256,
    before: change.before,
    replacement: change.after,
    after: source.replace(change.before, () => change.after),
  };
}

/**
 * Validate a declarative replacement plan without changing the workspace.
 * The optional root exists solely for isolated tests; the command-line tool always uses repositoryRoot.
 */
export function preparePatch(plan, { root = repositoryRoot } = {}) {
  validatePlan(plan);
  const inspected = plan.changes.map((change) => inspectChange(root, change));
  return {
    objective: plan.objective,
    root,
    changes: inspected.map(({ path, before, replacement }) => ({
      path,
      status: "ready",
      preview: { before, after: replacement },
    })),
    inspected,
  };
}

/** Apply only a plan that has already passed complete preflight validation. */
export function applyPreparedPatch(prepared) {
  for (const change of prepared.inspected) {
    const currentFile = resolveWorkspaceFile(prepared.root, change.path);
    const current = readFileSync(currentFile);
    if (sha256(current) !== change.sha256 || !current.equals(change.bytes))
      fail(`File changed after preflight: ${change.path}`);
    change.file = currentFile;
  }
  for (const change of prepared.inspected) writeFileSync(change.file, change.after, "utf8");
  return { objective: prepared.objective, changes: prepared.changes };
}

export function runPatch(plan, options = {}) {
  const prepared = preparePatch(plan, options);
  return options.apply
    ? applyPreparedPatch(prepared)
    : {
        objective: prepared.objective,
        changes: prepared.changes,
      };
}

function isCliMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliMain()) {
  const [planFile, ...argumentsAfterPlan] = process.argv.slice(2);
  if (
    !planFile ||
    argumentsAfterPlan.some((argument) => argument !== "--apply") ||
    argumentsAfterPlan.length > 1
  ) {
    console.error("Usage: pnpm patch:apply <patch.json> [--apply]");
    process.exitCode = 1;
  } else {
    try {
      let plan;
      try {
        plan = JSON.parse(readFileSync(planFile, "utf8"));
      } catch {
        fail("Invalid JSON plan.");
      }
      const result = runPatch(plan, { apply: argumentsAfterPlan[0] === "--apply" });
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Unable to apply patch.");
      process.exitCode = 1;
    }
  }
}

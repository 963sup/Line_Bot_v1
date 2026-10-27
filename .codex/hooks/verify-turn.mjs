import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { context, fingerprint, run, save } from "./runtime.mjs";

run((event) => {
  const { root, turn } = context(event);
  if (!turn || !existsSync(resolve(turn, "edits"))) return {};
  const paths = [
    ...new Set(
      readdirSync(resolve(turn, "edits"))
        .filter((name) => name.endsWith(".json"))
        .flatMap((name) => JSON.parse(readFileSync(resolve(turn, "edits", name), "utf8"))),
    ),
  ].sort();
  if (!paths.length) return {};
  const signature = fingerprint(root, [
    ...new Set([...paths, "scripts/check.mjs", "biome.json", "package.json", "pnpm-lock.yaml"]),
  ]);
  const evidence = resolve(turn, "evidence.json");
  if (existsSync(evidence) && JSON.parse(readFileSync(evidence, "utf8")).signature === signature)
    return {};
  if (event.stop_hook_active)
    return {
      systemMessage:
        "Stop hook continuation already used. Report remaining verification gaps; no automatic retry.",
    };
  const checks = [["patch", "--", "HEAD", "--", ...paths]];
  const lintPaths = paths.filter(
    (path) => /\.(?:[cm]?js|tsx?|json|jsonc|css)$/.test(path) && existsSync(resolve(root, path)),
  );
  if (lintPaths.length) checks.push(["lint", "--", ...lintPaths.map((path) => `./${path}`)]);
  const results = checks.map((args, index) => {
    const log = resolve(turn, `check-${signature}-${index}.log`);
    const fd = openSync(log, "w", 0o600);
    let result;
    try {
      result = spawnSync(process.execPath, [resolve(root, "scripts/check.mjs"), ...args], {
        cwd: root,
        stdio: ["ignore", fd, fd],
        timeout: 20000,
      });
    } finally {
      closeSync(fd);
    }
    return {
      stage: args[0],
      exitCode: result.status,
      signal: result.signal,
      errorCode: result.error?.code ?? null,
      failed: Boolean(result.error || result.signal || result.status !== 0),
      log,
    };
  });
  save(evidence, { signature, paths, results });
  const failures = results.filter((result) => result.failed);
  const summary = `Scoped lightweight checks: ${results.length - failures.length}/${results.length} passed. Evidence: ${evidence}. Typecheck, business tests, build and providers are not verified by this hook.`;
  if (!failures.length) return { systemMessage: summary };
  return {
    decision: "block",
    reason: `${summary} Inspect the bounded failure logs and fix affected issues, or report pre-existing failures/unavailable tools explicitly. Do not weaken checks. This hook will not request another continuation.`,
  };
});

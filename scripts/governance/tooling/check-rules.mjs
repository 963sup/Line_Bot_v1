import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const cli = process.env.CODEX_CLI;
if (!cli || !isAbsolute(cli) || !existsSync(cli)) {
  console.error(
    "Set CODEX_CLI to the current Codex executable absolute path. No CLI is downloaded.",
  );
  process.exit(1);
}
const root = fileURLToPath(new URL("../../", import.meta.url));
for (const name of readdirSync(new URL("../../.codex/rules/", import.meta.url)).filter((name) =>
  name.endsWith(".rules"),
)) {
  // Loading a rule file runs its embedded match/not_match assertions. The probe is not executed.
  const result = spawnSync(
    cli,
    ["execpolicy", "check", "--rules", `.codex/rules/${name}`, "--", "codex-tooling-noop"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    console.error(result.stderr || result.error?.message || "Rules validation failed.");
    process.exit(1);
  }
  console.log(`Rules OK: ${name}`);
}

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const commands = {
  "check:repository": ["node", "scripts/check-repository-contracts.mjs"],
  "codex:config": ["node", "--test", "scripts/tooling/codex-config.test.mjs"],
  hooks: ["node", "--test", "scripts/tooling/hooks.test.mjs"],
  lint: ["pnpm", "exec", "biome", "check"],
  dependencies: [
    "pnpm",
    "exec",
    "depcruise",
    "--config",
    ".dependency-cruiser.mjs",
    "apps",
    "packages",
    "scripts",
  ],
  knip: ["pnpm", "exec", "knip"],
  typecheck: ["pnpm", "exec", "turbo", "run", "typecheck", "--concurrency=2"],
  test: ["pnpm", "exec", "turbo", "run", "test", "--concurrency=2"],
  build: ["pnpm", "exec", "turbo", "run", "build"],
  "schema:check": ["pnpm", "exec", "turbo", "run", "schema:check"],
  format: ["pnpm", "exec", "biome", "check", "--write"],
  patch: ["git", "diff", "--check"],
  bootstrap: ["bash", ".codex/bootstrap/verify.sh"],
  "bootstrap:smoke": ["bash", ".codex/bootstrap/tests/smoke.sh"],
  actionlint: ["bash", ".codex/bootstrap/install.sh", "--exec", "actionlint"],
  shfmt: ["bash", ".codex/bootstrap/install.sh", "--exec", "shfmt", "-d", ".codex/bootstrap"],
  taplo: [
    "bash",
    ".codex/bootstrap/install.sh",
    "--exec",
    "taplo",
    "check",
    ".codex/config.toml",
    "packages/integration-supabase/src/config.toml",
  ],
};
const explicitStages = ["format", "bootstrap", "bootstrap:smoke", "actionlint", "shfmt", "taplo"];
const stages = Object.keys(commands).filter((stage) => !explicitStages.includes(stage));
const args = process.argv.slice(2);
const separator = args.indexOf("--");
const requested = separator === -1 ? args : args.slice(0, separator);
const forwarded = separator === -1 ? [] : args.slice(separator + 1);

if (requested.includes("--help")) {
  console.log(
    `Usage: pnpm check [${Object.keys(commands).join(" ")}] [-- tool arguments]\nDefaults to repository checks in order; ${explicitStages.join(", ")} are explicit only.\nTool arguments require exactly one stage.`,
  );
} else {
  const unknown = requested.filter((stage) => !Object.hasOwn(commands, stage));
  if (unknown.length > 0 || (forwarded.length > 0 && requested.length !== 1)) {
    console.error(
      unknown.length > 0
        ? `Unknown check stages: ${unknown.join(", ")}`
        : "Tool arguments require exactly one stage.",
    );
    process.exitCode = 2;
  } else {
    const cwd = fileURLToPath(new URL("../", import.meta.url));
    for (const stage of requested.length === 0 ? stages : [...new Set(requested)]) {
      console.log(`Check: ${stage}`);
      const [command, ...commandArgs] = commands[stage];
      if ((stage === "lint" || stage === "format") && forwarded.length === 0) commandArgs.push(".");
      const result = spawnSync(
        command === "node" ? process.execPath : command,
        [...commandArgs, ...forwarded],
        { cwd, stdio: "inherit" },
      );
      if (result.error) console.error(result.error.message);
      if (result.error || result.signal || result.status !== 0) {
        console.error(`Check failed: ${stage}`);
        process.exitCode = result.status || 1;
        break;
      }
    }
  }
}

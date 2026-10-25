import { fileURLToPath } from "node:url";
import { createOutputDirectory, runBoundedCommand } from "./bounded-output.mjs";

export function parseValidationCommand(argv) {
  const separator = argv.indexOf("--");
  const options = separator < 0 ? argv : argv.slice(0, separator);
  const command = separator < 0 ? [] : argv.slice(separator + 1);
  const labelIndex = options.indexOf("--label");
  const label = labelIndex < 0 ? null : options[labelIndex + 1];
  const unknown = options.filter((value, index) => value !== "--label" && index !== labelIndex + 1);

  if (!label || labelIndex < 0 || unknown.length || command.length === 0)
    throw new Error("Usage: pnpm validation:run --label <label> -- <pnpm arguments>");
  return { command, label };
}

export function executeValidationCommand({
  command,
  cwd,
  label,
  outputDirectory = createOutputDirectory(cwd, "validation-command-"),
  pnpmExecPath = process.env.npm_execpath,
}) {
  if (!pnpmExecPath)
    throw new Error("validation:run must run through the pinned pnpm command surface.");
  const started = performance.now();
  const result = runBoundedCommand(process.execPath, [pnpmExecPath, ...command], {
    cwd,
    env: process.env,
    label,
    outputDirectory,
  });
  return {
    command: ["pnpm", ...command],
    diagnostic: result.diagnostic,
    durationMs: Math.round(performance.now() - started),
    error: result.error?.message ?? null,
    label,
    logPath: result.logPath,
    ok: !result.error && result.status === 0,
    status: result.status ?? null,
  };
}

function main() {
  try {
    const { command, label } = parseValidationCommand(process.argv.slice(2));
    const result = executeValidationCommand({ command, cwd: process.cwd(), label });
    const output = JSON.stringify(result);
    if (result.ok) console.log(output);
    else {
      console.error(output);
      process.exit(result.status ?? 1);
    }
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");

function redact(value, secrets) {
  let result = value;
  for (const secret of secrets) if (secret) result = result.replaceAll(secret, "<redacted>");
  return result;
}

export function runSupabaseCli(
  args,
  {
    capture = false,
    cwd = repositoryRoot,
    env = process.env,
    maxBuffer = 64 * 1024,
    secrets = [],
    timeout,
    failureMessage,
  } = {},
) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
    ...(timeout === undefined ? {} : { timeout }),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? redact(`${result.stderr || result.stdout}`.trim(), secrets) : "";
    const message =
      failureMessage ?? `supabase ${args.map((arg) => redact(arg, secrets)).join(" ")} failed`;
    throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
  }
  return capture ? result.stdout : "";
}

import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const preload = fileURLToPath(new URL("./cli-test-preload.mjs", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export function runCli(script, input, scenario = "success", environment = {}) {
  const result = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(preload).href, `./${script}`],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...environment,
        CLI_SCENARIO: scenario,
        NODE_ENV: "test",
        SystemRoot: process.env.SystemRoot ?? "",
      },
      input: typeof input === "string" ? input : JSON.stringify(input),
      timeout: 5000,
    },
  );
  const channel = result.status === 0 ? result.stdout : result.stderr;
  return { ...result, json: JSON.parse(channel.trim()) };
}

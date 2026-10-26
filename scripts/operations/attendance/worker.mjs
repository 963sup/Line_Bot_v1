import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  boundedSpawnOptions,
  createOutputDirectory,
  readBoundedTail,
} from "../../core/runtime/bounded-output.mjs";
import { loadRootEnv, repositoryRoot } from "../../core/runtime/load-env.mjs";

loadRootEnv();
const require = createRequire(join(repositoryRoot, "apps/web/package.json"));
const outputDirectory = createOutputDirectory(repositoryRoot, "attendance-");
const output = boundedSpawnOptions(outputDirectory, "worker");
const child = spawn(
  process.execPath,
  [
    require.resolve("tsx/cli"),
    join(repositoryRoot, "apps/web/src/app/api/_composition/attendance-worker.server.ts"),
  ],
  { cwd: repositoryRoot, env: process.env, stdio: output.stdio },
);
child.on("error", () => {
  output.close();
  console.error("Unable to run attendance worker");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  output.close();
  if (code !== 0) {
    console.error(readBoundedTail(output.logPath));
    console.error(`Full log: ${output.logPath}`);
  }
  process.exitCode = code ?? 1;
});

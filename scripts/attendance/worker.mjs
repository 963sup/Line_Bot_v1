import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { loadRootEnv, repositoryRoot } from "../runtime/load-env.mjs";

loadRootEnv();
const require = createRequire(join(repositoryRoot, "apps/web/package.json"));
const child = spawn(
  process.execPath,
  [
    require.resolve("tsx/cli"),
    join(repositoryRoot, "apps/web/src/app/api/_composition/attendance-worker.server.ts"),
  ],
  { cwd: repositoryRoot, env: process.env, stdio: "inherit" },
);
child.on("error", () => {
  console.error("Unable to run attendance worker");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

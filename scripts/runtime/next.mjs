import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { loadRootEnv, repositoryRoot } from "./load-env.mjs";

loadRootEnv();
const web = join(repositoryRoot, "apps", "web");
const require = createRequire(join(web, "package.json"));
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)],
  {
    cwd: web,
    env: process.env,
    stdio: "inherit",
  },
);
child.on("error", () => {
  console.error("Unable to start Next.js.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  boundedSpawnOptions,
  createOutputDirectory,
  readBoundedFailure,
} from "./bounded-output.mjs";
import { loadRootEnv, repositoryRoot } from "./load-env.mjs";

loadRootEnv();
const web = join(repositoryRoot, "apps", "web");
const require = createRequire(join(web, "package.json"));
const outputDirectory = createOutputDirectory(repositoryRoot, "next-");
const output = boundedSpawnOptions(outputDirectory, "next");
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)],
  {
    cwd: web,
    env: process.env,
    stdio: output.stdio,
  },
);
child.on("error", () => {
  output.close();
  console.error("Unable to start Next.js.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  output.close();
  if (code !== 0) {
    console.error(readBoundedFailure(output.logPath));
    console.error(`Full log: ${output.logPath}`);
  }
  process.exitCode = code ?? 1;
});

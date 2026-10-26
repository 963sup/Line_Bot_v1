import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

type Command = "deployments" | "projects" | "version";

function printHelp(): void {
  console.log(`Usage: pnpm provider:vercel [command]

Read-only Vercel project and deployment operations.

Commands:
  projects      List accessible Vercel projects
  deployments   List recent deployments
  version       Show the pinned Vercel CLI version
  help          Show this help
`);
}

function parseCommand(): Command | "help" {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  if (values.help || positionals[0] === "help") return "help";

  const command = positionals[0] ?? "projects";
  if (command === "projects" || command === "deployments" || command === "version") {
    return command;
  }

  throw new Error(`Unknown Vercel command: ${command}`);
}

async function run(command: Command): Promise<number> {
  const args =
    command === "projects"
      ? ["exec", "vercel", "project", "ls"]
      : command === "deployments"
        ? ["exec", "vercel", "ls"]
        : ["exec", "vercel", "--version"];

  return await new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Vercel CLI terminated by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const command = parseCommand();
  if (command === "help") {
    printHelp();
    return;
  }

  process.exitCode = await run(command);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

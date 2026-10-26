import { spawn } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";

type Command = "status" | "version";

function printHelp(): void {
  console.log(`Usage: pnpm provider:supabase [command]

Read-only Supabase Docker stack operations.

Commands:
  status   Show the local Supabase stack status as JSON (default)
  version  Show the pinned Supabase CLI version
  help     Show this help
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

  const command = positionals[0] ?? "status";
  if (command === "status" || command === "version") return command;

  throw new Error(`Unknown Supabase command: ${command}`);
}

async function run(command: Command): Promise<number> {
  const args =
    command === "status"
      ? ["exec", "supabase", "status", "--output", "json"]
      : ["exec", "supabase", "--version"];
  const env = {
    ...process.env,
    SUPABASE_HOME: process.env.SUPABASE_HOME ?? join(process.cwd(), ".cache", "supabase"),
  };

  return await new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Supabase CLI terminated by ${signal}`));
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

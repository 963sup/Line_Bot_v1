import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const localEnvFile = join(repositoryRoot, ".env.local");

// Load before starting Next.js so its workers inherit the same environment.
// Existing shell/deployment variables take precedence. Tests never load secrets.
export function loadRootEnv(root = repositoryRoot) {
  if (process.env.NODE_ENV === "test" || process.env.VERCEL === "1") return;
  for (const directory of [root, join(root, "apps", "web")]) {
    if (!existsSync(directory)) continue;
    const conflicting = readdirSync(directory).some(
      (name) =>
        (name === ".env" || name.startsWith(".env.")) &&
        !(directory === root && [".env.local", ".env.example"].includes(name)),
    );
    if (conflicting)
      throw new Error(
        "Keep environment files only at repository root: .env.example and .env.local.",
      );
  }
  const file = join(root, ".env.local");
  if (!existsSync(file)) return;
  const names = new Set();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match) continue;
    if (names.has(match[1])) throw new Error("Duplicate environment variable in root .env.local.");
    names.add(match[1]);
  }
  loadEnvFile(file);
}

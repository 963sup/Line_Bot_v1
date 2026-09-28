import { glob, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeDataAccess } from "./data-access-core.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function checkDataAccess() {
  const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
  const [semanticModel, implementationTopology, dataTopology] = await Promise.all([
    readJson("architecture/semantic-model.json"),
    readJson("architecture/implementation-topology.json"),
    readJson("architecture/data-topology.json"),
  ]);
  const sources = {};
  for await (const path of glob("packages/*/src/**/*.{ts,tsx,js,mjs}", { cwd: root })) {
    sources[path] = await readFile(resolve(root, path), "utf8");
  }
  const errors = validateRuntimeDataAccess(
    semanticModel,
    implementationTopology,
    dataTopology,
    sources,
  );
  return { errors, sourceCount: Object.keys(sources).length };
}

if (import.meta.main) {
  const result = await checkDataAccess();
  for (const error of result.errors) console.error(error);
  console.log(
    "Runtime data access: " +
      result.sourceCount +
      " source files, " +
      result.errors.length +
      " violations.",
  );
  if (result.errors.length) process.exitCode = 1;
}

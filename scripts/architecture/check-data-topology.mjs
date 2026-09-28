import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDataTopology, loadDataTopologySources } from "./data-topology-core.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function checkDataTopology() {
  const [model, sources] = await Promise.all([
    readFile(resolve(repositoryRoot, "architecture/semantic-model.json"), "utf8").then(JSON.parse),
    loadDataTopologySources(repositoryRoot),
  ]);
  const compiled = compileDataTopology(
    model,
    sources.dataTopology,
    sources.schemaFiles,
    sources.relationsByFile,
  );
  return {
    errors: compiled.errors,
    surfaceCount: compiled.surfaces.size,
    schemaFileCount: compiled.schemaFiles.length,
  };
}

if (process.argv[1] && relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === "") {
  const result = await checkDataTopology();
  for (const error of result.errors) console.error(error);
  console.log(
    "Data topology: " +
      result.surfaceCount +
      " surfaces / " +
      result.schemaFileCount +
      " schema files, " +
      result.errors.length +
      " violations.",
  );
  if (result.errors.length) process.exitCode = 1;
}

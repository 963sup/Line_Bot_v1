import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSemanticArchitecture } from "./semantic-core.mjs";
import { packageSemanticDocs } from "./semantic-projection.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

const compiled = await loadSemanticArchitecture();
if (compiled.errors.length) {
  throw new Error("Semantic architecture is invalid:\n" + compiled.errors.join("\n"));
}

for (const [path, content] of packageSemanticDocs(compiled)) {
  const target = resolve(repositoryRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

console.log("Package semantics: " + packageSemanticDocs(compiled).size + " projections written.");

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSemanticArchitecture } from "./semantic-core.mjs";
import { packageSemanticDocs } from "./semantic-projection.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function validatePackageSemanticDocs(compiled) {
  if (compiled.errors.length) return [];
  const errors = [];
  for (const [path, expected] of packageSemanticDocs(compiled)) {
    try {
      const actual = await readFile(resolve(repositoryRoot, path), "utf8");
      if (actual !== expected) {
        errors.push(
          "Package semantics drift: " + path + " does not match canonical semantic projection; run pnpm semantic:packages",
        );
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        errors.push(
          "Package semantics missing: " + path + "; run pnpm semantic:packages",
        );
        continue;
      }
      throw error;
    }
  }
  return errors;
}

export async function checkSemanticArchitecture() {
  const compiled = await loadSemanticArchitecture();
  const packageSemanticErrors = await validatePackageSemanticDocs(compiled);
  return {
    errors: [...compiled.errors, ...packageSemanticErrors],
    ownerCount: compiled.owners.size,
    conceptCount: compiled.concepts.size,
    relationshipCount: compiled.relationships.size,
    dataSurfaceCount: compiled.dataSurfaces.size,
  };
}

if (process.argv[1] && relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === "") {
  const result = await checkSemanticArchitecture();
  for (const error of result.errors) console.error(error);
  console.log(
    "Semantic architecture: " +
      result.ownerCount +
      " owners, " +
      result.conceptCount +
      " concepts, " +
      result.relationshipCount +
      " relationships, " +
      result.dataSurfaceCount +
      " data surfaces, " +
      result.errors.length +
      " violations.",
  );
  if (result.errors.length) process.exitCode = 1;
}

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSemanticArchitecture } from "./semantic-core.mjs";

export async function checkSemanticArchitecture() {
  const compiled = await loadSemanticArchitecture();
  return {
    errors: compiled.errors,
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

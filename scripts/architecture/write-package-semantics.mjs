import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSemanticArchitecture } from "./semantic-core.mjs";
import { packageSemanticDocs } from "./semantic-projection.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function writePackageSemanticDocs(compiled, root = repositoryRoot) {
  if (compiled.errors.length) {
    throw new Error("Semantic architecture is invalid:\n" + compiled.errors.join("\n"));
  }

  const docs = packageSemanticDocs(compiled);
  for (const [path, content] of docs) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return { written: docs.size };
}

if (import.meta.main) {
  console.log(
    JSON.stringify(await writePackageSemanticDocs(await loadSemanticArchitecture()), null, 2),
  );
}

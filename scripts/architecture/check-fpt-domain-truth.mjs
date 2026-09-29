import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFptDomainTruth, validateFptDomainTruth } from "./fpt-domain-core.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function checkFptDomainTruth(root = repositoryRoot) {
  const fpt = await loadFptDomainTruth(root);
  return {
    errors: validateFptDomainTruth(fpt),
    fileCount: Object.keys(fpt.files).length,
    symbolCount: fpt.symbols.size,
    revision: fpt.manifest.upstream.revision,
  };
}

if (process.argv[1] && relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === "") {
  const result = await checkFptDomainTruth();
  for (const error of result.errors) console.error(error);
  console.log(
    `FPT domain truth: ${result.fileCount} JSON files, ${result.symbolCount} indexed symbols, revision ${result.revision}, ${result.errors.length} violations.`,
  );
  if (result.errors.length) process.exitCode = 1;
}

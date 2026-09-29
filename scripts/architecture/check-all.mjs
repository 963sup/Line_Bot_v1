import { checkArchitecture } from "./check-architecture.mjs";
import { checkDataAccess } from "./check-data-access.mjs";
import { checkDataTopology } from "./check-data-topology.mjs";
import { checkFptDomainTruth } from "./check-fpt-domain-truth.mjs";
import { checkImplementationTopology } from "./check-implementation-topology.mjs";
import { checkSemanticArchitecture } from "./check-semantic-architecture.mjs";

const architecture = await checkArchitecture();
for (const error of architecture.errors) console.error(error);
console.log(
  "Architecture: " +
    architecture.moduleCount +
    " modules, " +
    architecture.errors.length +
    " violations.",
);

const topology = await checkImplementationTopology();
for (const error of topology.errors) console.error(error);
console.log(
  "Implementation topology: " +
    topology.packageCount +
    " modules, " +
    topology.errors.length +
    " violations.",
);

const fpt = await checkFptDomainTruth();
for (const error of fpt.errors) console.error(error);
console.log(
  "FPT domain truth: " +
    fpt.fileCount +
    " JSON files, " +
    fpt.symbolCount +
    " indexed symbols, " +
    fpt.errors.length +
    " violations.",
);

const dataAccess = await checkDataAccess();
for (const error of dataAccess.errors) console.error(error);
console.log(
  "Runtime data access: " +
    dataAccess.sourceCount +
    " source files, " +
    dataAccess.errors.length +
    " violations.",
);

const dataTopology = await checkDataTopology();
for (const error of dataTopology.errors) console.error(error);
console.log(
  "Data topology: " +
    dataTopology.surfaceCount +
    " surfaces / " +
    dataTopology.schemaFileCount +
    " schema files, " +
    dataTopology.errors.length +
    " violations.",
);

const semantic = await checkSemanticArchitecture();
for (const error of semantic.errors) console.error(error);
console.log(
  "Semantic architecture: " +
    semantic.ownerCount +
    " owners, " +
    semantic.conceptCount +
    " concepts, " +
    semantic.relationshipCount +
    " relationships, " +
    semantic.errors.length +
    " violations.",
);

if (
  architecture.errors.length ||
  dataAccess.errors.length ||
  topology.errors.length ||
  fpt.errors.length ||
  dataTopology.errors.length ||
  semantic.errors.length
) {
  process.exitCode = 1;
}

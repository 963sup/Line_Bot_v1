import { checkArchitecture } from "./check-architecture.mjs";
import { checkDataAccess } from "./check-data-access.mjs";
import { checkDataTopology } from "./check-data-topology.mjs";
import { checkFptDomainTruth } from "./check-fpt-domain-truth.mjs";
import { checkImplementationTopology } from "./check-implementation-topology.mjs";
import { checkSemanticArchitecture } from "./check-semantic-architecture.mjs";
import { reportArchitectureViolations } from "./report-violations.mjs";

const architecture = await checkArchitecture();
reportArchitectureViolations("architecture", architecture.errors);
console.log(
  "Architecture: " +
    architecture.moduleCount +
    " modules, " +
    architecture.errors.length +
    " violations.",
);

const topology = await checkImplementationTopology();
reportArchitectureViolations("implementation-topology", topology.errors);
console.log(
  "Implementation topology: " +
    topology.packageCount +
    " modules, " +
    topology.errors.length +
    " violations.",
);

const fpt = await checkFptDomainTruth();
reportArchitectureViolations("fpt-domain-truth", fpt.errors);
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
reportArchitectureViolations("data-access", dataAccess.errors);
console.log(
  "Runtime data access: " +
    dataAccess.workspaceCount +
    " workspaces / " +
    dataAccess.sourceCount +
    " source files / " +
    dataAccess.queryCount +
    " queries, " +
    dataAccess.violationCount +
    " violations, " +
    dataAccess.analysisFailureCount +
    " analysis failures, " +
    dataAccess.forwardedCount +
    " neutral forwards, " +
    dataAccess.testingOnlySourceCount +
    " declared test-only entries.",
);

const dataTopology = await checkDataTopology();
reportArchitectureViolations("data-topology", dataTopology.errors);
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
reportArchitectureViolations("semantic-architecture", semantic.errors);
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

import { fileURLToPath } from "node:url";
import { createOutputDirectory, writeBoundedDiagnostic } from "../runtime/bounded-output.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export function reportArchitectureViolations(stage, errors, options = {}) {
  if (errors.length === 0) return;
  const outputDirectory =
    options.outputDirectory ??
    process.env.REPOSITORY_VALIDATION_OUTPUT_DIR ??
    createOutputDirectory(repositoryRoot, "architecture-");
  const report = writeBoundedDiagnostic(outputDirectory, `${stage}-violations`, errors.join("\n"));
  const write = options.write ?? console.error;
  write(`${stage}: ${errors.length} violations.`);
  write(report.diagnostic);
  write(`Full log: ${report.logPath}`);
}

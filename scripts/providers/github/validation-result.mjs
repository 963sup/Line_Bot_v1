import { pathToFileURL } from "node:url";

export function requireValidationSuccess(result) {
  if (result !== "success") {
    const normalized = result || "missing result";
    if (normalized === "cancelled") {
      throw new Error(
        "Validation was cancelled before every group completed; inspect the latest run because a newer revision may have superseded this run.",
      );
    }
    throw new Error(`Validation did not succeed: ${normalized}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValidationSuccess(process.env.RESULT);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

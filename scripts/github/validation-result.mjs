import { pathToFileURL } from "node:url";

export function requireValidationSuccess(result) {
  if (result !== "success") {
    throw new Error(`Validation did not succeed: ${result || "missing result"}`);
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

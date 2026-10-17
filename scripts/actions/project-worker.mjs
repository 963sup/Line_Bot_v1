import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { readInternalInput } from "../runtime/internal-input.mjs";
import { loadRootEnv } from "../runtime/load-env.mjs";
import { projectActionRuntime } from "./project-composition.mjs";

loadRootEnv();
const db = new PostgresDatabase();
try {
  const input = await readInternalInput();
  if (Object.keys(input).some((k) => k !== "limit"))
    throw new Error("Worker input accepts limit only.");
  console.log(
    JSON.stringify({
      ok: true,
      value: await projectActionRuntime(db).worker.once(input.limit ?? 20),
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Project Actions worker unavailable; no provider payload is logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}

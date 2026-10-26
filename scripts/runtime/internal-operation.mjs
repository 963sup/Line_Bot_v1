import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { classifyInternalFailure } from "./internal-failure.mjs";
import { internalActor, readInternalInput } from "./internal-input.mjs";
import { loadRootEnv } from "./load-env.mjs";

/** Runs the shared lifecycle for authenticated internal domain operations. */
export async function runInternalOperation({
  errorMessage,
  errorClass,
  classifyFailure = classifyInternalFailure,
  operation,
}) {
  let db;
  let mutationStarted = false;
  try {
    loadRootEnv();
    db = new PostgresDatabase();
    const input = await readInternalInput();
    const actor = await internalActor(db, input.proof);
    const result = await operation({
      db,
      input,
      actor,
      markMutation: () => {
        mutationStarted = true;
      },
    });
    return { ok: true, value: result };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage,
      ...classifyFailure(error, errorClass, mutationStarted),
    };
  } finally {
    if (db)
      try {
        await db.close();
      } catch {}
  }
}

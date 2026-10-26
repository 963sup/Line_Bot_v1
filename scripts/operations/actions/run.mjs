import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { internalActor, readInternalInput } from "../../core/runtime/internal-input.mjs";
import { loadRootEnv } from "../../core/runtime/load-env.mjs";
import { actionRuntime } from "./composition.mjs";

loadRootEnv();
const db = new PostgresDatabase();
try {
  const input = await readInternalInput(),
    actor = await internalActor(db, input.proof);
  const { actions } = actionRuntime(db);
  const value =
    input.operation === "rules"
      ? await actions.rules(actor, input.repositoryId)
      : input.operation === "run"
        ? await actions.run(actor, input.repositoryId, input.id)
        : input.operation === "execute"
          ? await actions.execute(actor, input.command)
          : null;
  if (value === null) throw new Error("Invalid operation or missing run.");
  console.log(JSON.stringify({ ok: true, value }));
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Actions unavailable; no identity or provider payload is logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}

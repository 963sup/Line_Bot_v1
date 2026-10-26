import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { createWikiHistory } from "@line_bot_v1/wiki/application/use-cases/history";
import { createWiki } from "@line_bot_v1/wiki/application/use-cases/pages";
import { createPostgresWikiDependencies } from "@line_bot_v1/wiki/composition/bootstrap/wiki-pages";
import { internalActor, readInternalInput } from "../../core/runtime/internal-input.mjs";
import { loadRootEnv } from "../../core/runtime/load-env.mjs";

loadRootEnv();
const db = new PostgresDatabase();
try {
  const input = await readInternalInput();
  const actor = await internalActor(db, input.proof);
  const store = createPostgresWikiDependencies(db);
  const wiki = createWiki({ ...store, now: Date.now });
  const history = createWikiHistory(store.reads);
  let result;
  if (input.operation === "execute") result = await wiki.execute(actor, input.command);
  else if (input.operation === "list" && typeof input.repositoryId === "string")
    result = await wiki.list(actor, input.repositoryId, input.after);
  else if (input.operation === "read") result = await wiki.read(actor, input.query);
  else if (input.operation === "history")
    result = await history.history(actor, input.query, input.before);
  else if (input.operation === "compare")
    result = await history.compare(actor, input.query, input.beforeId, input.afterId);
  else throw new Error("Unknown Wiki operation.");
  console.log(JSON.stringify({ ok: true, value: result }));
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Wiki operation failed; no credential or provider payload is logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}

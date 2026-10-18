import { createRepositoryPulse } from "@line_bot_v1/insights/application/use-cases/repository-pulse";
import { createPostgresIssueMetrics } from "@line_bot_v1/issue/composition/bootstrap/metrics";
import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import { internalActor, readInternalInput } from "../runtime/internal-input.mjs";
import { loadRootEnv } from "../runtime/load-env.mjs";

loadRootEnv();
const db = new PostgresDatabase();
try {
  const input = await readInternalInput(),
    actor = await internalActor(db, input.proof);
  const pulse = createRepositoryPulse({
    qualify: async (userId, repositoryId) => {
      await db.transaction((sql) => repositoryContentScope(sql, userId, { repositoryId }));
    },
    issues: createPostgresIssueMetrics(db),
    now: Date.now,
  });
  console.log(JSON.stringify({ ok: true, value: await pulse.read(actor, input.query) }));
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Repository Pulse unavailable; no provider payload is logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}

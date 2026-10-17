import { createPostgresProjectWbsMetrics } from "@line_bot_v1/wbs/composition/bootstrap/project-metrics";
import { activeLineUser } from "./account.server";

let metrics: ReturnType<typeof createPostgresProjectWbsMetrics> | undefined;

export async function readProjectWbsMetrics(subject: string, projectId: string) {
  const actor = await activeLineUser(subject);
  return {
    actorUserId: actor.id,
    projectId,
    metrics: await (metrics ??= createPostgresProjectWbsMetrics()).read(actor.id, projectId),
  };
}

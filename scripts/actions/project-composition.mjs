import { createProjectActions } from "@line_bot_v1/actions/application/use-cases/project-automation";
import { createProjectActionsWorker } from "@line_bot_v1/actions/application/use-cases/project-worker";
import { createPostgresProjectActionDependencies } from "@line_bot_v1/actions/composition/bootstrap/project-automation";
import { pushLineText } from "@line_bot_v1/line/messaging-api";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line/provider";
import { createProjectBaselineNotifications } from "@line_bot_v1/notifications/application/use-cases/project-baseline-delivery";
import { createPostgresProjectBaselineDeliveryStore } from "@line_bot_v1/notifications/composition/bootstrap/project-baseline-delivery";
import { createPostgresProjectWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/project-baseline-events";
import { createPostgresProjectWbsStore } from "@line_bot_v1/wbs/composition/bootstrap/project-content";
import { checkWbsPublication } from "@line_bot_v1/wbs/domain/governance";
export function projectActionRuntime(db) {
  const notifications = createProjectBaselineNotifications({
    store: createPostgresProjectBaselineDeliveryStore(db, LINE_PROVIDER_NAMESPACE),
    send: (target, payload, key) =>
      process.env.LINE_CHANNEL_ACCESS_TOKEN
        ? pushLineText(process.env.LINE_CHANNEL_ACCESS_TOKEN, target, payload, key)
        : Promise.resolve("unavailable"),
    inboxUrl: new URL("/notifications", process.env.APP_ORIGIN).href,
    now: Date.now,
  });
  const wbs = createPostgresProjectWbsStore(db);
  const steps = {
    notifications,
    events: createPostgresProjectWbsBaselineEvents(db),
    check: async (userId, projectId, revisionId) => {
      const view = await wbs.read(userId, { projectId }, revisionId);
      if (!view.revision) throw new Error("WBS revision unavailable.");
      return {
        revisionId: view.revision.id,
        findings: checkWbsPublication(view.revision.document),
      };
    },
  };
  const deps = { ...createPostgresProjectActionDependencies(db), steps, now: Date.now };
  return { actions: createProjectActions(deps), worker: createProjectActionsWorker(deps) };
}

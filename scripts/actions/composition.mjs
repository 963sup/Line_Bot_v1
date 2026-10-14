import { createActions } from "@line_bot_v1/actions/application/use-cases/automation";
import { createActionsWorker } from "@line_bot_v1/actions/application/use-cases/worker";
import { createPostgresActionStore } from "@line_bot_v1/actions/composition/bootstrap/automation";
import { pushLineText } from "@line_bot_v1/line/messaging-api";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line/provider";
import { createBaselineNotifications } from "@line_bot_v1/notifications/application/use-cases/baseline-delivery";
import { createPostgresBaselineDeliveryStore } from "@line_bot_v1/notifications/composition/bootstrap/baseline-delivery";
import { createPostgresWbsBaselineEvents } from "@line_bot_v1/wbs/composition/bootstrap/baseline-events";
import { createPostgresWbsStore } from "@line_bot_v1/wbs/composition/bootstrap/store";
import { checkWbsPublication } from "@line_bot_v1/wbs/domain/governance";
export function actionRuntime(db) {
  const notifications = createBaselineNotifications({
    store: createPostgresBaselineDeliveryStore(db, LINE_PROVIDER_NAMESPACE),
    send: (target, payload, key) =>
      process.env.LINE_CHANNEL_ACCESS_TOKEN
        ? pushLineText(process.env.LINE_CHANNEL_ACCESS_TOKEN, target, payload, key)
        : Promise.resolve("unavailable"),
    inboxUrl: new URL("/notifications", process.env.APP_ORIGIN).href,
    now: Date.now,
  });
  const wbs = createPostgresWbsStore(db);
  const steps = {
    notifications,
    events: createPostgresWbsBaselineEvents(db),
    check: async (userId, repositoryId, revisionId) => {
      const view = await wbs.read(userId, { repositoryId }, revisionId);
      if (!view.revision) throw new Error("WBS revision unavailable.");
      return {
        revisionId: view.revision.id,
        findings: checkWbsPublication(view.revision.document),
      };
    },
  };
  const deps = { store: createPostgresActionStore(db), steps, now: Date.now };
  return { actions: createActions(deps), worker: createActionsWorker(deps) };
}

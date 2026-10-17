import type { ProjectBaselineNotifications } from "@line_bot_v1/notifications/contracts/output/project-baseline-delivery";
import type { ProjectWbsBaselineEvents } from "@line_bot_v1/wbs/contracts/output/project-baseline-events";
export type ProjectFixedSteps = {
  events: ProjectWbsBaselineEvents;
  notifications: ProjectBaselineNotifications;
  check(userId: string, projectId: string, revisionId: string): Promise<unknown>;
};

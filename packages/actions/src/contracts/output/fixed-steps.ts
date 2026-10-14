import type { BaselineNotifications } from "@line_bot_v1/notifications/contracts/output/baseline-delivery";
import type { WbsBaselineEvents } from "@line_bot_v1/wbs/contracts/output/baseline-events";
export type FixedSteps = {
  events: WbsBaselineEvents;
  notifications: BaselineNotifications;
  check(userId: string, repositoryId: string, revisionId: string): Promise<unknown>;
};

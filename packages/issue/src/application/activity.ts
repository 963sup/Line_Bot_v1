import type { IssueActivityStore } from "../contracts/activity.js";

const ACTIVITY_LIMIT = 20;

export function createIssueActivity(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): IssueActivityStore;
}) {
  return {
    read: async (subject: string) =>
      deps.store().activity((await deps.activeUser(subject)).id, ACTIVITY_LIMIT),
  };
}

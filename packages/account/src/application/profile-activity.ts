import type { UserProfileActivityStore } from "./ports/profile-activity.js";

export function createUserProfileActivity(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): UserProfileActivityStore;
}) {
  return {
    read: async (subject: string) => deps.store().read((await deps.activeUser(subject)).id),
  };
}

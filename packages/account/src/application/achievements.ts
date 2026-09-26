import { UserError } from "../domain/user.js";
import type { UserAchievementStore } from "./ports/achievements.js";

function achievementLimit(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) {
    throw new UserError(400, "成就讀取範圍不正確。");
  }
  return value;
}

export function createUserAchievements(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): UserAchievementStore;
}) {
  return {
    list: async (subject: string, limit = 12) =>
      deps.store().list((await deps.activeUser(subject)).id, achievementLimit(limit)),
  };
}

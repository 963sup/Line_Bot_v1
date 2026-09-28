export type UserAchievement = Readonly<{
  id: string;
  name: string;
  description: string;
  iconRef: string | null;
  sourceKind: string;
  sourceId: string;
  awardedAt: number;
}>;

export interface UserAchievementStore {
  list(userId: string, limit: number): Promise<UserAchievement[]>;
}

export type UserProfileAchievement = Readonly<{
  id: string;
  name: string;
  description: string;
  iconRef: string | null;
  visibility: "private" | "organization" | "public";
  awardedAt: number;
  sourceKind: string;
}>;

export type UserContributionDay = Readonly<{
  day: string;
  count: number;
}>;

export type UserProfileActivity = Readonly<{
  achievements: readonly UserProfileAchievement[];
  contributions: readonly UserContributionDay[];
}>;

export interface UserProfileActivityStore {
  read(userId: string): Promise<UserProfileActivity>;
}

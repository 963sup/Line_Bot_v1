import type { RepositoryCapability } from "../../domain.js";

export type TrendingRepository = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
  visibility: string;
  capability: RepositoryCapability;
  recentStarCount: number;
  starCount: number;
  starred: boolean;
}>;

export type RepositoryActivityItem = Readonly<{
  id: string;
  occurredAt: number;
  actorLogin: string;
  action: string;
  repository: Readonly<{
    id: string;
    ownerLogin: string;
    name: string;
  }>;
  issue: Readonly<{
    number: number;
    title: string;
  }>;
}>;

export type RepositoryDiscoverySnapshot = Readonly<{
  trending: TrendingRepository[];
  activity: RepositoryActivityItem[];
}>;

export type RepositoryDiscoveryOptions = Readonly<{
  recentSince: number;
  trendingLimit: number;
  activityLimit: number;
}>;

export interface RepositoryDiscoveryStore {
  snapshot(
    userId: string,
    options: RepositoryDiscoveryOptions,
  ): Promise<RepositoryDiscoverySnapshot>;
}

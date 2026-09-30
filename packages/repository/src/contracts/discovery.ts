import type { RepositoryCapability } from "../domain.js";

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

export type RepositoryStarListDiscovery = Readonly<{
  id: string;
  ownerLogin: string;
  name: string;
  description: string;
  visibleRepositoryCount: number;
  updatedAt: number;
  repositories: ReadonlyArray<
    Readonly<{
      id: string;
      ownerLogin: string;
      name: string;
    }>
  >;
}>;

export type RepositoryDiscoverySnapshot = Readonly<{
  trending: TrendingRepository[];
}>;

export type RepositoryDiscoveryOptions = Readonly<{
  recentSince: number;
  trendingLimit: number;
}>;

export interface RepositoryDiscoveryStore {
  snapshot(
    userId: string,
    options: RepositoryDiscoveryOptions,
  ): Promise<RepositoryDiscoverySnapshot>;
  publishedStarLists(userId: string, limit: number): Promise<RepositoryStarListDiscovery[]>;
}

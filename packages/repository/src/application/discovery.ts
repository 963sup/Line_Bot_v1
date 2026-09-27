import type { RepositoryDiscoveryStore } from "./ports/discovery.js";

const TRENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TRENDING_LIMIT = 20;
const ACTIVITY_LIMIT = 20;

export function createRepositoryDiscovery(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): RepositoryDiscoveryStore;
  now(): number;
}) {
  return {
    discover: async (subject: string) => {
      const userId = (await deps.activeUser(subject)).id;
      const now = deps.now();
      return deps.store().snapshot(userId, {
        recentSince: Math.max(0, now - TRENDING_WINDOW_MS),
        trendingLimit: TRENDING_LIMIT,
        activityLimit: ACTIVITY_LIMIT,
      });
    },
  };
}

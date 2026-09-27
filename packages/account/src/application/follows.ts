import { UserError } from "../domain/user.js";
import type { FollowStore } from "./ports/follows.js";

function targetUserId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 128) throw new UserError(400, "使用者識別碼不正確。");
  return id;
}

export function createFollows(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): FollowStore;
  now(): number;
}) {
  async function actor(subject: string) {
    return (await deps.activeUser(subject)).id;
  }

  return {
    follow: async (subject: string, target: string) => {
      const followerUserId = await actor(subject);
      const followedUserId = targetUserId(target);
      if (followerUserId === followedUserId) {
        throw new UserError(400, "不能追蹤自己。");
      }
      await deps.store().follow(followerUserId, followedUserId, deps.now());
    },

    unfollow: async (subject: string, target: string) => {
      const followerUserId = await actor(subject);
      const followedUserId = targetUserId(target);
      if (followerUserId === followedUserId) {
        throw new UserError(400, "不能取消追蹤自己。");
      }
      await deps.store().unfollow(followerUserId, followedUserId);
    },

    followers: async (subject: string) => deps.store().followers(await actor(subject)),
    following: async (subject: string) => deps.store().following(await actor(subject)),
  };
}

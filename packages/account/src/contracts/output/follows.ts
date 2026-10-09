export type FollowItem = {
  userId: string;
  followedAt: number;
};

export interface FollowStore {
  follow(followerUserId: string, followedUserId: string, at: number): Promise<void>;
  unfollow(followerUserId: string, followedUserId: string): Promise<void>;
  followers(userId: string): Promise<FollowItem[]>;
  following(userId: string): Promise<FollowItem[]>;
}

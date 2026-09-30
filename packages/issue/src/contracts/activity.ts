export type IssueActivityItem = Readonly<{
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

export interface IssueActivityStore {
  activity(userId: string, limit: number): Promise<IssueActivityItem[]>;
}

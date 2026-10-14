export type WbsBaselineEvent = Readonly<{
  id: string;
  cursor: number;
  repositoryId: string;
  baselineId: string;
  revisionId: string;
  at: number;
  leaseToken: string;
}>;
export interface WbsBaselineEvents {
  cursor(repositoryId: string): Promise<number>;
  claim(now: number): Promise<WbsBaselineEvent | null>;
  acknowledge(event: WbsBaselineEvent, now: number): Promise<boolean>;
}

export type EnterpriseLifecycleCommand = Readonly<{
  action: "deactivate" | "reactivate";
  requestId: string;
  enterpriseAccountId: string;
  expectedVersion: number;
  reason: string;
}>;

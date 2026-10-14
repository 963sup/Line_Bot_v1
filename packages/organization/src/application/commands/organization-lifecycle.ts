export type OrganizationLifecycleCommand = Readonly<{
  action: "deactivate" | "reactivate";
  requestId: string;
  organizationAccountId: string;
  expectedVersion: number;
  reason: string;
}>;

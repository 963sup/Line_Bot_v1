import type { PayrollRuleKey, PayrollRuleVersion } from "../../domain/readiness.js";

type PayPeriod = Readonly<{
  startDate: string;
  endDateExclusive: string;
}>;

export type PayrollReadinessQuery = Readonly<{
  organizationId: string;
  employmentId: string;
  payPeriod: PayPeriod;
  requiredRuleKeys?: readonly PayrollRuleKey[];
}>;

export interface PayrollReadinessSources {
  workforceVersion(query: PayrollReadinessQuery): Promise<string | null>;
  attendancePeriodVersion(query: PayrollReadinessQuery): Promise<string | null>;
  ruleVersions(query: PayrollReadinessQuery): Promise<readonly PayrollRuleVersion[]>;
}

import type { PayrollRuleKey } from "../../domain/value-objects/payroll-rule.js";

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

import type { PayrollRuleVersion } from "../../domain/value-objects/payroll-rule.js";
import type { PayrollReadinessQuery } from "../input/payroll-readiness-query.js";

export interface PayrollReadinessSources {
  workforceVersion(query: PayrollReadinessQuery): Promise<string | null>;
  attendancePeriodVersion(query: PayrollReadinessQuery): Promise<string | null>;
  ruleVersions(query: PayrollReadinessQuery): Promise<readonly PayrollRuleVersion[]>;
}

import { assessPayrollReadiness, PayrollFoundationError } from "../domain/readiness.js";
import type { PayrollReadinessQuery, PayrollReadinessSources } from "./ports/readiness.js";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function assertQuery(query: PayrollReadinessQuery) {
  if (!query.organizationId.trim())
    throw new PayrollFoundationError("organizationId must not be empty.");
  if (!query.employmentId.trim())
    throw new PayrollFoundationError("employmentId must not be empty.");
  if (!isoDate.test(query.payPeriod.startDate) || !isoDate.test(query.payPeriod.endDateExclusive)) {
    throw new PayrollFoundationError("payPeriod dates must use YYYY-MM-DD.");
  }
  if (query.payPeriod.startDate >= query.payPeriod.endDateExclusive) {
    throw new PayrollFoundationError("payPeriod end must be after start.");
  }
}

export function createPayrollReadiness(sources: PayrollReadinessSources) {
  return async function getPayrollReadiness(query: PayrollReadinessQuery) {
    assertQuery(query);
    const [workforceVersion, attendancePeriodVersion, ruleVersions] = await Promise.all([
      sources.workforceVersion(query),
      sources.attendancePeriodVersion(query),
      sources.ruleVersions(query),
    ]);
    return assessPayrollReadiness({
      workforceVersion,
      attendancePeriodVersion,
      ruleVersions,
      requiredRuleKeys: query.requiredRuleKeys,
    });
  };
}

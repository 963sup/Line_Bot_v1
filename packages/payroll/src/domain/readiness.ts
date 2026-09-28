export const payrollRuleKeys = [
  "minimum-wage",
  "working-time",
  "overtime",
  "labor-pension",
  "labor-insurance",
  "health-insurance",
] as const;

export type PayrollRuleKey = (typeof payrollRuleKeys)[number];

export type PayrollRuleVersion = Readonly<{
  key: PayrollRuleKey;
  version: string;
  effectiveFrom: string;
  sourceId: string;
}>;

export type PayrollReadinessInput = Readonly<{
  workforceVersion: string | null;
  attendancePeriodVersion: string | null;
  ruleVersions: readonly PayrollRuleVersion[];
  requiredRuleKeys?: readonly PayrollRuleKey[];
}>;

type PayrollMissingInput =
  | "workforce-version"
  | "attendance-period-version"
  | `rule:${PayrollRuleKey}`;

type PayrollInputVersion = Readonly<{
  workforceVersion: string;
  attendancePeriodVersion: string;
  ruleVersions: readonly PayrollRuleVersion[];
}>;

export type PayrollReadiness =
  | Readonly<{ ready: true; inputVersion: PayrollInputVersion }>
  | Readonly<{ ready: false; missing: readonly PayrollMissingInput[] }>;

export class PayrollFoundationError extends Error {}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new PayrollFoundationError(`${field} must not be empty.`);
  return normalized;
}

function normalizeRuleVersions(ruleVersions: readonly PayrollRuleVersion[]) {
  const seen = new Set<PayrollRuleKey>();
  return ruleVersions.map((rule) => {
    if (seen.has(rule.key)) {
      throw new PayrollFoundationError(`Duplicate payroll rule version for ${rule.key}.`);
    }
    seen.add(rule.key);
    return {
      key: rule.key,
      version: requiredText(rule.version, `${rule.key}.version`),
      effectiveFrom: requiredText(rule.effectiveFrom, `${rule.key}.effectiveFrom`),
      sourceId: requiredText(rule.sourceId, `${rule.key}.sourceId`),
    } satisfies PayrollRuleVersion;
  });
}

export function assessPayrollReadiness(input: PayrollReadinessInput): PayrollReadiness {
  const requiredRuleKeys = input.requiredRuleKeys ?? payrollRuleKeys;
  const ruleVersions = normalizeRuleVersions(input.ruleVersions);
  const availableRules = new Set(ruleVersions.map((rule) => rule.key));
  const missing: PayrollMissingInput[] = [];

  const workforceVersion = input.workforceVersion?.trim() ?? "";
  const attendancePeriodVersion = input.attendancePeriodVersion?.trim() ?? "";

  if (!workforceVersion) missing.push("workforce-version");
  if (!attendancePeriodVersion) missing.push("attendance-period-version");
  for (const key of requiredRuleKeys) {
    if (!availableRules.has(key)) missing.push(`rule:${key}`);
  }

  if (missing.length > 0) return { ready: false, missing };

  return {
    ready: true,
    inputVersion: {
      workforceVersion,
      attendancePeriodVersion,
      ruleVersions,
    },
  };
}

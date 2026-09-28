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

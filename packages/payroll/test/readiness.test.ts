import assert from "node:assert/strict";
import test from "node:test";
import { createPayrollReadiness } from "../src/application/readiness.js";
import { payrollRuleKeys } from "../src/domain/readiness.js";

const query = {
  organizationId: "org-1",
  employmentId: "employment-1",
  payPeriod: { startDate: "2026-09-01", endDateExclusive: "2026-10-01" },
} as const;

const ruleVersions = payrollRuleKeys.map((key) => ({
  key,
  version: `TW-${key}-v1`,
  effectiveFrom: "2026-01-01",
  sourceId: `official:${key}`,
}));

test("payroll readiness fails closed when upstream versions are missing", async () => {
  const readiness = createPayrollReadiness({
    workforceVersion: async () => null,
    attendancePeriodVersion: async () => null,
    ruleVersions: async () => [],
  });

  const result = await readiness(query);
  assert.equal(result.ready, false);
  if (result.ready) return;
  assert.deepEqual(result.missing, [
    "workforce-version",
    "attendance-period-version",
    ...payrollRuleKeys.map((key) => `rule:${key}` as const),
  ]);
});

test("payroll readiness returns one explicit input version set", async () => {
  const readiness = createPayrollReadiness({
    workforceVersion: async () => "workforce-v7",
    attendancePeriodVersion: async () => "attendance-v3",
    ruleVersions: async () => ruleVersions,
  });

  const result = await readiness(query);
  assert.equal(result.ready, true);
  if (!result.ready) return;
  assert.equal(result.inputVersion.workforceVersion, "workforce-v7");
  assert.equal(result.inputVersion.attendancePeriodVersion, "attendance-v3");
  assert.deepEqual(result.inputVersion.ruleVersions, ruleVersions);
});

test("payroll readiness rejects ambiguous duplicate rule versions", async () => {
  const readiness = createPayrollReadiness({
    workforceVersion: async () => "workforce-v7",
    attendancePeriodVersion: async () => "attendance-v3",
    ruleVersions: async () => [ruleVersions[0]!, ruleVersions[0]!],
  });

  await assert.rejects(() => readiness(query), /Duplicate payroll rule version/);
});

test("payroll readiness rejects invalid pay periods before reading dependencies", async () => {
  let reads = 0;
  const readiness = createPayrollReadiness({
    workforceVersion: async () => {
      reads += 1;
      return "workforce-v7";
    },
    attendancePeriodVersion: async () => {
      reads += 1;
      return "attendance-v3";
    },
    ruleVersions: async () => {
      reads += 1;
      return ruleVersions;
    },
  });

  await assert.rejects(
    () =>
      readiness({
        ...query,
        payPeriod: { startDate: "2026-10-01", endDateExclusive: "2026-10-01" },
      }),
    /payPeriod end must be after start/,
  );
  assert.equal(reads, 0);
});

import type { Sql, SqlRow } from "@line_bot_v1/platform/postgres";
import {
  type NumberAllocation,
  type NumberAllocationRequest,
  NumberingIntegrityError,
  type NumberSeriesRef,
  numberLimit,
} from "./domain/numbering.js";

type AllocationRow = Readonly<{
  resource_kind: unknown;
  resource_id: unknown;
  number: unknown;
}>;

function decodeText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new NumberingIntegrityError(`Numbering returned an invalid ${field}.`);
  return value;
}

function decodeResourceKind(value: unknown): NumberAllocation["resourceKind"] {
  if (
    value === "ISSUE" ||
    value === "PULL_REQUEST" ||
    value === "DISCUSSION" ||
    value === "MILESTONE" ||
    value === "PROJECT" ||
    value === "PROJECT_VIEW"
  )
    return value;
  throw new NumberingIntegrityError("Numbering returned an invalid resource kind.");
}

function decodeNumber(value: unknown, limit: number): number {
  const decoded =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(decoded) || decoded < 1 || decoded > limit)
    throw new NumberingIntegrityError("Numbering returned an invalid number.");
  return decoded;
}

function decodeAllocationRow(row: SqlRow): AllocationRow {
  return {
    resource_kind: row.resource_kind,
    resource_id: row.resource_id,
    number: row.number,
  };
}

export async function allocateNumber(sql: Sql, input: NumberAllocationRequest): Promise<number> {
  const row = (
    await sql.query(
      `SELECT app_private.allocate_number($1,$2,$3,$4,$5,$6) AS number`,
      [
        input.family,
        input.scopeKind,
        input.scopeId,
        input.resourceKind,
        input.resourceId,
        input.at,
      ],
      (value) => ({ number: value.number }),
    )
  ).rows[0];
  if (!row) throw new NumberingIntegrityError("Numbering did not return an allocation.");
  return decodeNumber(row.number, numberLimit(input.family));
}

export async function resolveNumber(
  sql: Sql,
  series: NumberSeriesRef,
  number: number,
): Promise<NumberAllocation | null> {
  if (!Number.isSafeInteger(number) || number < 1 || number > numberLimit(series.family))
    return null;
  const row = (
    await sql.query(
      `SELECT resource_kind,resource_id,number
       FROM app_private.resolve_number($1,$2,$3,$4)`,
      [series.family, series.scopeKind, series.scopeId, number],
      decodeAllocationRow,
    )
  ).rows[0];
  if (!row) return null;
  return {
    resourceKind: decodeResourceKind(row.resource_kind),
    resourceId: decodeText(row.resource_id, "resource id"),
    number: decodeNumber(row.number, numberLimit(series.family)),
  };
}

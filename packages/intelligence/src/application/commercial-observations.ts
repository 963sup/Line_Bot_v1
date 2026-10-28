import { createHash } from "node:crypto";
import {
  CommercialIntakeError,
  type CommercialObservationPayload,
} from "../contracts/output/commercial-intake.js";
export function stableCommercialId(namespace: string, key: string): string {
  const hex = createHash("sha256").update(`${namespace}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
function raw(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && value.length <= 16000 && !value.includes("\u0000"))
  );
}
function invalid(): never {
  throw new CommercialIntakeError("EXTRACTION_OUTPUT_INVALID", 422, "extraction.validate");
}
export function validateCommercialObservations(
  value: unknown,
  pageCount: number,
): CommercialObservationPayload {
  if (
    !object(value, Object.hasOwn(value as object, "wbsDraft") ? ["observations", "semanticHints", "wbsDraft"] : ["observations", "semanticHints"]) ||
    !Array.isArray(value.observations) ||
    !Array.isArray(value.semanticHints) ||
    value.observations.length < 1 ||
    value.observations.length > 4000 ||
    value.semanticHints.length > 8000 ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > 393_216
  )
    return invalid();
  const observations = value.observations.map((observation) => {
    if (
      !object(observation, ["pageNumber", "rawLabel", "rawValue"]) ||
      !Number.isSafeInteger(observation.pageNumber) ||
      Number(observation.pageNumber) < 1 ||
      Number(observation.pageNumber) > pageCount ||
      !raw(observation.rawLabel) ||
      !raw(observation.rawValue)
    )
      return invalid();
    return {
      pageNumber: Number(observation.pageNumber),
      rawLabel: observation.rawLabel,
      rawValue: observation.rawValue,
    };
  });
  const observationCount = observations.length;
  const semanticHints = value.semanticHints.map((hint) => {
    if (
      !object(hint, ["observationIndex", "target", "rowKey"]) ||
      !Number.isSafeInteger(hint.observationIndex) ||
      Number(hint.observationIndex) < 0 ||
      Number(hint.observationIndex) >= observationCount ||
      typeof hint.target !== "string" ||
      !hint.target.trim() ||
      hint.target.length > 256 ||
      hint.target.includes("\u0000") ||
      !(
        hint.rowKey === null ||
        (typeof hint.rowKey === "string" &&
          !!hint.rowKey.trim() &&
          hint.rowKey.length <= 256 &&
          !hint.rowKey.includes("\u0000"))
      ) ||
      (hint.target.startsWith("item.") && hint.rowKey === null)
    )
      return invalid();
    return {
      observationIndex: Number(hint.observationIndex),
      target: hint.target,
      rowKey: hint.rowKey,
    };
  });
  const rawWbsDraft = Reflect.get(value, "wbsDraft");
  if (rawWbsDraft === undefined) return { observations, semanticHints, wbsDraft: { workRows: [] } };
  if (!object(rawWbsDraft, ["workRows"]) || !Array.isArray(rawWbsDraft.workRows)) return invalid();
  const itemKeys = new Set(
    semanticHints.filter((hint) => hint.target.startsWith("item.")).map((hint) => hint.rowKey),
  );
  const seen = new Set<string>();
  const workRows = rawWbsDraft.workRows.map((row) => {
    if (
      !object(row, ["rowKey", "eligible", "blockers"]) ||
      typeof row.rowKey !== "string" ||
      !itemKeys.has(row.rowKey) ||
      seen.has(row.rowKey) ||
      typeof row.eligible !== "boolean" ||
      !Array.isArray(row.blockers) ||
      row.blockers.some((blocker) => typeof blocker !== "string" || !blocker.trim() || blocker.length > 256)
    ) return invalid();
    seen.add(row.rowKey);
    return { rowKey: row.rowKey, eligible: row.eligible, blockers: row.blockers };
  });
  return { observations, semanticHints, wbsDraft: { workRows } };
}

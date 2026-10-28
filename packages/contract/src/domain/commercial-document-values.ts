/** Source facts retain their decimal/date notation and explicit evidence. */
export type EvidenceReference =
  | { kind: "EXTRACTION"; extractionResultId: string; observationId: string }
  | { kind: "HUMAN"; evidenceId: string };
export type MissingReason = "NOT_PRESENT" | "UNREADABLE" | "AMBIGUOUS";
export type CommercialFieldValue<T> = {
  value: T | null;
  missingReason: MissingReason | null;
  evidenceRefs: EvidenceReference[];
  origin: "EXTRACTION" | "HUMAN_CORRECTION";
  correctionReason: string | null;
};
export type Money = { amount: string; currencyCode: string | null };

/** Null means explicitly missing; source facts and corrections retain their evidence. */
export function hasConsistentMissingReason(value: unknown, reason: MissingReason | null): boolean {
  return (value === null) === (reason !== null);
}
export function hasEvidenceForFact(value: unknown, refs: readonly EvidenceReference[]): boolean {
  return value === null || refs.length > 0;
}
export function hasConsistentCorrectionReason(
  origin: CommercialFieldValue<unknown>["origin"],
  reason: string | null,
): boolean {
  return (origin === "HUMAN_CORRECTION") === (reason !== null);
}

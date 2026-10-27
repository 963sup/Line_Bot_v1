import { z } from "zod";
import {
  type DocumentSource,
  PURCHASE_ORDER_CATEGORIES,
  type PurchaseOrderCandidate,
  type SourceReviewAttestation,
} from "./document-intake.js";
import { ContractError } from "./error.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;
const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function fail(message: string): never {
  throw new ContractError(400, message, "INVALID_INPUT");
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return (
    Object.keys(value).length === allowed.length &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

function text(value: unknown): value is string {
  return typeof value === "string";
}

function pages(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.every((page) => Number.isSafeInteger(page) && page > 0) &&
    new Set(value).size === value.length
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const nullableText = z.string().nullable();
const decimalText = z.string().regex(decimal).nullable();
const sourcePages = z
  .array(z.number().int().positive())
  .refine((items) => new Set(items).size === items.length, "Source pages must be unique.");
const evidence = z
  .object({ sourcePages, rawText: nullableText, confidence: nullableText })
  .strict();

/** Runtime authority for every purchase-order candidate accepted by Contract. */
export const purchaseOrderCandidateSchema = z
  .object({
    header: z
      .object({
        documentNumber: nullableText,
        revision: nullableText,
        issueDate: nullableText.refine((value) => value === null || isIsoDate(value), "Invalid date."),
        title: nullableText,
        currency: nullableText,
      })
      .strict(),
    buyer: z.object({ name: nullableText, registrationNumber: nullableText }).strict(),
    seller: z.object({ name: nullableText, registrationNumber: nullableText }).strict(),
    lines: z.array(
      z
        .object({
          sourceRowId: z.string().min(1),
          itemNumber: nullableText,
          category: z.enum(PURCHASE_ORDER_CATEGORIES).nullable(),
          materialCode: nullableText,
          description: nullableText,
          quantity: decimalText,
          unit: nullableText,
          unitPrice: decimalText,
          grossAmount: decimalText,
          discountAmount: decimalText,
          netAmount: decimalText,
          deliveryDate: nullableText.refine(
            (value) => value === null || isIsoDate(value),
            "Invalid date.",
          ),
          sourcePages,
          uncertain: z.boolean(),
        })
        .strict(),
    ),
    totals: z
      .object({
        gross: decimalText,
        discount: decimalText,
        net: decimalText,
        tax: decimalText,
        total: decimalText,
      })
      .strict(),
    terms: z.object({ text: nullableText, sourcePages }).strict(),
    fieldEvidence: z.record(z.string(), z.array(evidence)),
    corrections: z.array(
      z
        .object({
          field: z.string().min(1),
          original: nullableText,
          replacement: z.string().min(1),
          reason: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((candidate, context) => {
    const rowIds = candidate.lines.map((line) => line.sourceRowId);
    if (new Set(rowIds).size !== rowIds.length)
      context.addIssue({ code: "custom", message: "Source row IDs must be unique.", path: ["lines"] });
  });

export function decodeDocumentSource(value: unknown): DocumentSource {
  const keys = ["fileId", "fileRevisionId", "fileSha256"];
  if (
    !record(value) ||
    !exactKeys(value, keys) ||
    !text(value.fileId) ||
    !uuid.test(value.fileId) ||
    !text(value.fileRevisionId) ||
    !uuid.test(value.fileRevisionId) ||
    !text(value.fileSha256) ||
    !sha256.test(value.fileSha256)
  )
    return fail("Invalid Contract document source pin.");
  return {
    fileId: value.fileId.toLowerCase(),
    fileRevisionId: value.fileRevisionId.toLowerCase(),
    fileSha256: value.fileSha256,
  };
}

export function decodeSourceReviewAttestation(value: unknown): SourceReviewAttestation {
  const keys = [
    "verifiedLineCount",
    "reviewedSourcePages",
    "reviewedSourceRowIds",
    "confirmedFromOriginal",
  ];
  if (
    !record(value) ||
    !exactKeys(value, keys) ||
    typeof value.verifiedLineCount !== "number" ||
    !Number.isSafeInteger(value.verifiedLineCount) ||
    value.verifiedLineCount < 1 ||
    !pages(value.reviewedSourcePages) ||
    !Array.isArray(value.reviewedSourceRowIds) ||
    value.reviewedSourceRowIds.length === 0 ||
    !value.reviewedSourceRowIds.every((rowId) => text(rowId) && rowId.length > 0) ||
    new Set(value.reviewedSourceRowIds).size !== value.reviewedSourceRowIds.length ||
    value.confirmedFromOriginal !== true
  )
    return fail("Invalid original source review attestation.");
  return {
    verifiedLineCount: value.verifiedLineCount,
    reviewedSourcePages: [...value.reviewedSourcePages],
    reviewedSourceRowIds: [...value.reviewedSourceRowIds],
    confirmedFromOriginal: true,
  };
}

export function decodePurchaseOrderCandidate(value: unknown): PurchaseOrderCandidate {
  const parsed = purchaseOrderCandidateSchema.safeParse(value);
  if (!parsed.success) return fail("Invalid purchase-order candidate.");
  return parsed.data;
}

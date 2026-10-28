import { createHash } from "node:crypto";
import { z } from "zod";
import { commercialDocumentContentSchema } from "../../contracts/input/commercial-document.js";
import {
  currencyCodeSchema,
  dateOnlySchema,
  decimalStringSchema,
} from "../../contracts/input/commercial-document-values.js";
import type { CommercialDocumentContent } from "../../domain/commercial-document.js";
import type { CommercialDocumentEvidenceContext } from "../../domain/commercial-document-evidence.js";
import { ContractError } from "../../domain/error.js";
import { validateCommercialDocumentEvidence } from "../commercial-document-evidence.js";

/** Contract's structural input projection; the caller qualifies actor/scope/source before reading it. */
export type CommercialDocumentTechnicalResult = Readonly<{
  extractionResultId: string;
  repositoryId: string;
  source: Readonly<{ fileId: string; fileRevisionId: string; sha256: string }>;
  pageCount: number;
  observations: readonly Readonly<{
    observationId: string;
    pageNumber: number;
    rawLabel: string | null;
    rawValue: string | null;
  }>[];
  semanticHints: readonly Readonly<{
    observationIndex: number;
    target: string;
    rowKey: string | null;
  }>[];
}>;

const technicalResultSchema = z.object({
  extractionResultId: z.uuid(),
  repositoryId: z.string().min(1).max(128),
  source: z.object({
    fileId: z.uuid(),
    fileRevisionId: z.uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  pageCount: z.number().int().min(1).max(24),
  observations: z
    .array(
      z.object({
        observationId: z.uuid(),
        pageNumber: z.number().int().positive(),
        rawLabel: z.string().max(16000).nullable(),
        rawValue: z.string().max(16000).nullable(),
      }),
    )
    .max(4000),
  semanticHints: z
    .array(
      z.object({
        observationIndex: z.number().int().nonnegative(),
        target: z.string().min(1).max(256),
        rowKey: z.string().min(1).max(256).nullable(),
      }),
    )
    .max(8000),
});

const headerKeys = [
  "documentNumber",
  "documentRevisionLabel",
  "title",
  "issueDate",
  "validUntilDate",
  "defaultCurrencyCode",
] as const;
const itemKeys = [
  "itemNumber",
  "referenceCode",
  "description",
  "quantity",
  "unitLabel",
  "unitPrice",
  "lineAmount",
  "deliveryDate",
] as const;
const sourceDocumentKinds: Readonly<Record<string, CommercialDocumentContent["documentKind"]>> = {
  PURCHASE_ORDER: "PURCHASE_ORDER",
  "PURCHASE ORDER": "PURCHASE_ORDER",
  採購單: "PURCHASE_ORDER",
  QUOTATION: "QUOTATION",
  報價單: "QUOTATION",
  ESTIMATE: "ESTIMATE",
  估價單: "ESTIMATE",
  CONTRACT: "CONTRACT",
  合約: "CONTRACT",
  UNCLASSIFIED: "UNCLASSIFIED",
};
type Ref = { kind: "EXTRACTION"; extractionResultId: string; observationId: string };
type Field<T> = {
  value: T | null;
  missingReason: "NOT_PRESENT" | "UNREADABLE" | "AMBIGUOUS" | null;
  evidenceRefs: Ref[];
  origin: "EXTRACTION";
  correctionReason: null;
};
type Extension = CommercialDocumentContent["extensionFields"][number];

function invalid(): never {
  throw new ContractError(
    400,
    "Technical result cannot be normalized within the commercial document contract.",
    "INVALID_INPUT",
  );
}

/** Deterministic, CPU-only translation. No provider, persistence, or review-state transition.
 * Unsupported relationships and noncanonical scalars retain their source as TEXT extensions.
 * Exceeding a bound rejects the whole input: observations are never truncated or dropped.
 */
export function normalizeCommercialDocument(result: CommercialDocumentTechnicalResult): Readonly<{
  content: CommercialDocumentContent;
  evidenceContext: CommercialDocumentEvidenceContext;
}> {
  const parsed = technicalResultSchema.safeParse(result);
  if (!parsed.success) invalid();
  const input = parsed.data;
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 393_216) invalid();
  const observationIds = new Set<string>();
  for (const observation of input.observations) {
    if (observation.pageNumber > input.pageCount || observationIds.has(observation.observationId))
      invalid();
    observationIds.add(observation.observationId);
  }
  const hints = new Map<number, typeof input.semanticHints>();
  for (const hint of input.semanticHints) {
    if (hint.observationIndex >= input.observations.length) invalid();
    const existing = hints.get(hint.observationIndex) ?? [];
    existing.push(hint);
    hints.set(hint.observationIndex, existing);
  }
  const identity = (kind: string, key: string) => {
    const hex = createHash("sha256")
      .update(
        JSON.stringify(["commercial-document-normalizer/v1", input.extractionResultId, kind, key]),
      )
      .digest("hex")
      .slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20)}`;
  };
  const reference = (index: number): Ref => ({
    kind: "EXTRACTION",
    extractionResultId: input.extractionResultId,
    observationId: input.observations[index]?.observationId ?? invalid(),
  });
  const extensions: Extension[] = [];
  const retained = new Set<number>();
  const retain = (index: number, destination: Extension[] = extensions) => {
    if (retained.has(index)) return;
    const observation = input.observations[index] ?? invalid();
    destination.push({
      fieldId: identity("extension", String(index)),
      label: observation.rawLabel?.trim() || "Unlabelled observation",
      valueType: "TEXT",
      value: observation.rawValue,
      missingReason: observation.rawValue === null ? "UNREADABLE" : null,
      unitLabel: null,
      evidenceRefs: [reference(index)],
    });
    retained.add(index);
  };
  const headerObservations = new Map<string, number[]>();
  const rowObservations = new Map<string, Map<string, number[]>>();
  const kinds: number[] = [];
  for (let index = 0; index < input.observations.length; index++) {
    const mapping = hints.get(index);
    // The fixed profile has no continuation/fragment relationship. Multiple mappings
    // cannot establish one; retaining the observation avoids silently choosing a hint.
    const hint = mapping?.length === 1 ? mapping[0] : undefined;
    if (!hint) {
      retain(index);
      continue;
    }
    if (hint.target === "documentKind" && hint.rowKey === null) {
      kinds.push(index);
      retain(index);
      continue;
    }
    if (
      hint.target.startsWith("header.") &&
      hint.rowKey === null &&
      headerKeys.some((key) => hint.target === `header.${key}`)
    ) {
      const list = headerObservations.get(hint.target) ?? [];
      list.push(index);
      headerObservations.set(hint.target, list);
      continue;
    }
    if (hint.rowKey !== null && itemKeys.some((key) => hint.target === `item.${key}`)) {
      const row = rowObservations.get(hint.rowKey) ?? new Map<string, number[]>();
      const list = row.get(hint.target) ?? [];
      list.push(index);
      row.set(hint.target, list);
      rowObservations.set(hint.rowKey, row);
      continue;
    }
    retain(index);
  }
  function field<T>(
    indices: number[] = [],
    schema: z.ZodType<T>,
    destination: Extension[] = extensions,
  ): Field<T> {
    const base = {
      evidenceRefs: indices.map(reference),
      origin: "EXTRACTION" as const,
      correctionReason: null,
    };
    if (!indices.length) return { ...base, value: null, missingReason: "NOT_PRESENT" };
    if (indices.length > 1) {
      for (const index of indices) retain(index, destination);
      return { ...base, value: null, missingReason: "AMBIGUOUS" };
    }
    const index = indices[0] ?? invalid();
    const raw = input.observations[index]?.rawValue ?? null;
    if (raw === null) return { ...base, value: null, missingReason: "UNREADABLE" };
    const value = schema.safeParse(raw.trim());
    if (!value.success) {
      retain(index, destination);
      return { ...base, value: null, missingReason: "AMBIGUOUS" };
    }
    return { ...base, value: value.data, missingReason: null };
  }
  const textSchema = z.string().min(1).max(8000);
  const header = {
    documentNumber: field(headerObservations.get("header.documentNumber"), textSchema),
    documentRevisionLabel: field(
      headerObservations.get("header.documentRevisionLabel"),
      textSchema,
    ),
    title: field(headerObservations.get("header.title"), textSchema),
    issueDate: field(headerObservations.get("header.issueDate"), dateOnlySchema),
    validUntilDate: field(headerObservations.get("header.validUntilDate"), dateOnlySchema),
    defaultCurrencyCode: field(
      headerObservations.get("header.defaultCurrencyCode"),
      currencyCodeSchema,
    ),
  };
  const rows: CommercialDocumentContent["rows"] = [];
  for (const [rowKey, mapping] of rowObservations) {
    const rowExtensions: Extension[] = [];
    const get = <T>(key: string, schema: z.ZodType<T>) =>
      field(mapping.get(`item.${key}`), schema, rowExtensions);
    const money = z.string().transform((amount, ctx) => {
      const decimal = decimalStringSchema.safeParse(amount);
      if (!decimal.success) {
        ctx.addIssue({ code: "custom", message: "Invalid source amount." });
        return z.NEVER;
      }
      return { amount: decimal.data, currencyCode: header.defaultCurrencyCode.value };
    });
    rows.push({
      rowId: identity("row", rowKey),
      sectionId: null,
      position: rows.length,
      evidenceRefs: [...mapping.values()]
        .flat()
        .sort((a, b) => a - b)
        .map(reference),
      rowType: "ITEM",
      extensionFields: rowExtensions,
      itemNumber: get("itemNumber", textSchema),
      referenceCode: get("referenceCode", textSchema),
      description: get("description", textSchema),
      quantity: get("quantity", decimalStringSchema),
      unitLabel: get("unitLabel", z.string().min(1).max(128)),
      unitPrice: get("unitPrice", money),
      lineAmount: get("lineAmount", money),
      deliveryDate: get("deliveryDate", dateOnlySchema),
    });
  }
  const kindTitle =
    kinds.length === 1
      ? input.observations[kinds[0] ?? -1]?.rawValue?.trim().toUpperCase()
      : undefined;
  const kind =
    kindTitle !== undefined && Object.hasOwn(sourceDocumentKinds, kindTitle)
      ? sourceDocumentKinds[kindTitle]
      : undefined;
  const content = commercialDocumentContentSchema.safeParse({
    documentKind: kind ?? "UNCLASSIFIED",
    header,
    rows,
    parties: [],
    sections: [],
    selectionGroups: [],
    totals: [],
    terms: [],
    extensionFields: extensions,
  });
  if (!content.success) invalid();
  const evidenceContext: CommercialDocumentEvidenceContext = {
    extractionResultId: input.extractionResultId,
    source: { ...input.source },
    pageCount: input.pageCount,
    observations: input.observations.map(({ observationId, pageNumber }) => ({
      observationId,
      pageNumber,
    })),
    humanEvidence: [],
  };
  if (validateCommercialDocumentEvidence(content.data, evidenceContext).length) invalid();
  return { content: content.data, evidenceContext };
}

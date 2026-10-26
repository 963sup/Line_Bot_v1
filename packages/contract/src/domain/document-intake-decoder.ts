import {
  type DocumentSource,
  PURCHASE_ORDER_CATEGORIES,
  type PurchaseOrderCandidate,
  type PurchaseOrderFieldEvidence,
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

function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}

function nullableTextValue(value: unknown): string | null {
  if (nullableText(value)) return value;
  return fail("Invalid purchase-order text field.");
}

function decimalText(value: unknown): value is string | null {
  return value === null || (text(value) && decimal.test(value));
}

function decimalValue(value: unknown): string | null {
  if (decimalText(value)) return value;
  return fail("Invalid purchase-order decimal field.");
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

function isPurchaseOrderCategory(
  value: unknown,
): value is (typeof PURCHASE_ORDER_CATEGORIES)[number] {
  return PURCHASE_ORDER_CATEGORIES.some((category) => category === value);
}

function categoryValue(value: unknown): PurchaseOrderCandidate["lines"][number]["category"] {
  if (value === null) return null;
  if (isPurchaseOrderCategory(value)) return value;
  return fail("Invalid purchase-order category.");
}

function decodeParty(value: unknown): { name: string | null; registrationNumber: string | null } {
  const keys = ["name", "registrationNumber"];
  if (!record(value) || !exactKeys(value, keys) || !keys.every((key) => nullableText(value[key])))
    return fail("Invalid purchase-order party.");
  return {
    name: nullableTextValue(value.name),
    registrationNumber: nullableTextValue(value.registrationNumber),
  };
}

function decodeEvidence(value: unknown): PurchaseOrderFieldEvidence {
  const keys = ["sourcePages", "rawText", "confidence"];
  if (
    !record(value) ||
    !exactKeys(value, keys) ||
    !pages(value.sourcePages) ||
    !nullableText(value.rawText) ||
    !nullableText(value.confidence)
  )
    return fail("Invalid purchase-order field evidence.");
  const rawText = nullableTextValue(value.rawText);
  const confidence = nullableTextValue(value.confidence);
  return {
    sourcePages: [...value.sourcePages],
    rawText,
    confidence,
  };
}

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
  const keys = [
    "header",
    "buyer",
    "seller",
    "lines",
    "totals",
    "terms",
    "fieldEvidence",
    "corrections",
  ];
  if (!record(value) || !exactKeys(value, keys)) return fail("Invalid purchase-order candidate.");

  const headerKeys = ["documentNumber", "revision", "issueDate", "title", "currency"];
  const header = value.header;
  if (!record(header) || !exactKeys(header, headerKeys))
    return fail("Invalid purchase-order header.");
  const documentNumber = nullableTextValue(header.documentNumber);
  const revision = nullableTextValue(header.revision);
  const title = nullableTextValue(header.title);
  const currency = nullableTextValue(header.currency);
  const issueDate = nullableTextValue(header.issueDate);
  if (issueDate !== null && !isIsoDate(issueDate))
    return fail("Invalid purchase-order issue date.");

  if (!Array.isArray(value.lines)) return fail("Invalid purchase-order lines.");
  const lines: PurchaseOrderCandidate["lines"][number][] = value.lines.map((line) => {
    const lineKeys = [
      "sourceRowId",
      "itemNumber",
      "category",
      "materialCode",
      "description",
      "quantity",
      "unit",
      "unitPrice",
      "grossAmount",
      "discountAmount",
      "netAmount",
      "deliveryDate",
      "sourcePages",
      "uncertain",
    ];
    if (!record(line) || !exactKeys(line, lineKeys)) return fail("Invalid purchase-order line.");
    if (
      !text(line.sourceRowId) ||
      line.sourceRowId.length === 0 ||
      typeof line.uncertain !== "boolean"
    )
      return fail("Invalid purchase-order line.");
    const itemNumber = nullableTextValue(line.itemNumber);
    const materialCode = nullableTextValue(line.materialCode);
    const description = nullableTextValue(line.description);
    const unit = nullableTextValue(line.unit);
    const deliveryDate = nullableTextValue(line.deliveryDate);
    const quantity = decimalValue(line.quantity);
    const unitPrice = decimalValue(line.unitPrice);
    const grossAmount = decimalValue(line.grossAmount);
    const discountAmount = decimalValue(line.discountAmount);
    const netAmount = decimalValue(line.netAmount);
    const category = categoryValue(line.category);
    if (!pages(line.sourcePages)) return fail("Invalid purchase-order line pages.");
    if (deliveryDate !== null && !isIsoDate(deliveryDate))
      return fail("Invalid purchase-order delivery date.");
    return {
      sourceRowId: line.sourceRowId,
      itemNumber,
      category,
      materialCode,
      description,
      quantity,
      unit,
      unitPrice,
      grossAmount,
      discountAmount,
      netAmount,
      deliveryDate,
      sourcePages: [...line.sourcePages],
      uncertain: line.uncertain,
    };
  });

  const totalKeys = ["gross", "discount", "net", "tax", "total"];
  const totals = value.totals;
  if (!record(totals) || !exactKeys(totals, totalKeys))
    return fail("Invalid purchase-order totals.");
  const gross = decimalValue(totals.gross);
  const discount = decimalValue(totals.discount);
  const net = decimalValue(totals.net);
  const tax = decimalValue(totals.tax);
  const total = decimalValue(totals.total);

  const terms = value.terms;
  if (!record(terms) || !exactKeys(terms, ["text", "sourcePages"]) || !pages(terms.sourcePages))
    return fail("Invalid purchase-order terms.");
  const termsText = nullableTextValue(terms.text);

  if (!record(value.fieldEvidence)) return fail("Invalid purchase-order field evidence.");
  const fieldEvidence = Object.fromEntries(
    Object.entries(value.fieldEvidence).map(([field, entries]) => {
      if (!Array.isArray(entries)) return fail("Invalid purchase-order field evidence.");
      return [field, entries.map(decodeEvidence)];
    }),
  );

  if (!Array.isArray(value.corrections)) return fail("Invalid purchase-order corrections.");
  const corrections = value.corrections.map((item) => {
    const correctionKeys = ["field", "original", "replacement", "reason"];
    if (
      !record(item) ||
      !exactKeys(item, correctionKeys) ||
      !text(item.field) ||
      !nullableText(item.original) ||
      !text(item.replacement) ||
      !text(item.reason)
    )
      return fail("Invalid purchase-order corrections.");
    return {
      field: item.field,
      original: item.original,
      replacement: item.replacement,
      reason: item.reason,
    };
  });

  return {
    header: {
      documentNumber,
      revision,
      issueDate,
      title,
      currency,
    },
    buyer: decodeParty(value.buyer),
    seller: decodeParty(value.seller),
    lines,
    totals: {
      gross,
      discount,
      net,
      tax,
      total,
    },
    terms: { text: termsText, sourcePages: [...terms.sourcePages] },
    fieldEvidence,
    corrections,
  };
}

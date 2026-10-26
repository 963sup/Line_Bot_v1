import { ContractError } from "./error.js";

export type PurchaseOrderFieldEvidence = Readonly<{
  sourcePages: readonly number[];
  rawText: string | null;
  confidence: string | null;
}>;

export type PurchaseOrderCandidate = Readonly<{
  header: Readonly<{
    documentNumber: string | null;
    revision: string | null;
    issueDate: string | null;
    title: string | null;
    currency: string | null;
  }>;
  buyer: Readonly<{ name: string | null; registrationNumber: string | null }>;
  seller: Readonly<{ name: string | null; registrationNumber: string | null }>;
  lines: readonly Readonly<{
    sourceRowId: string;
    itemNumber: string | null;
    category: (typeof PURCHASE_ORDER_CATEGORIES)[number] | null;
    materialCode: string | null;
    description: string | null;
    quantity: string | null;
    unit: string | null;
    unitPrice: string | null;
    grossAmount: string | null;
    discountAmount: string | null;
    netAmount: string | null;
    deliveryDate: string | null;
    sourcePages: readonly number[];
    uncertain: boolean;
  }>[];
  totals: Readonly<{
    gross: string | null;
    discount: string | null;
    net: string | null;
    tax: string | null;
    total: string | null;
  }>;
  terms: Readonly<{ text: string | null; sourcePages: readonly number[] }>;
  fieldEvidence: Readonly<Record<string, readonly PurchaseOrderFieldEvidence[]>>;
  corrections: readonly Readonly<{
    field: string;
    original: string | null;
    replacement: string;
    reason: string;
  }>[];
}>;

export const PURCHASE_ORDER_CATEGORIES = ["material", "service", "freight", "other"] as const;

export type DocumentSource = Readonly<{
  fileId: string;
  fileRevisionId: string;
  fileSha256: string;
}>;

export type SourceReviewAttestation = Readonly<{
  verifiedLineCount: number;
  reviewedSourcePages: readonly number[];
  reviewedSourceRowIds: readonly string[];
  confirmedFromOriginal: true;
}>;

export type ContractDocumentRevision = Readonly<{
  schemaVersion: 1;
  id: string;
  documentId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  state: "DRAFT" | "CONFIRMED";
  source: DocumentSource;
  expectedLineCount: number;
  candidate: PurchaseOrderCandidate;
  diagnostics: readonly string[];
  acknowledgementReason: string | null;
  sourceReviewAttestation: SourceReviewAttestation | null;
}>;

function complete(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function decimalParts(value: string): { coefficient: bigint; scale: number } {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new ContractError(400, "Invalid exact decimal value.", "INVALID_INPUT");
  const negative = value.startsWith("-");
  const digits = value.replace(/^-/, "").split(".");
  const fraction = digits[1] ?? "";
  const coefficient = BigInt(`${digits[0]}${fraction}`) * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

export function addExactDecimals(values: readonly string[]): string {
  const parsed = values.map(decimalParts);
  const scale = parsed.reduce((current, item) => Math.max(current, item.scale), 0);
  const sum = parsed.reduce(
    (total, item) => total + item.coefficient * 10n ** BigInt(scale - item.scale),
    0n,
  );
  const negative = sum < 0n;
  const digits = (negative ? -sum : sum).toString().padStart(scale + 1, "0");
  if (!scale) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function equalExactDecimals(left: string, right: string): boolean {
  const first = decimalParts(left);
  const second = decimalParts(right);
  const scale = Math.max(first.scale, second.scale);
  return (
    first.coefficient * 10n ** BigInt(scale - first.scale) ===
    second.coefficient * 10n ** BigInt(scale - second.scale)
  );
}

function multiplyExactDecimals(left: string, right: string): string {
  const first = decimalParts(left);
  const second = decimalParts(right);
  const scale = first.scale + second.scale;
  const product = first.coefficient * second.coefficient;
  const negative = product < 0n;
  const digits = (negative ? -product : product).toString().padStart(scale + 1, "0");
  if (!scale) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function sourcePages(candidate: PurchaseOrderCandidate): Set<number> {
  return new Set([
    ...candidate.lines.flatMap((line) => line.sourcePages),
    ...candidate.terms.sourcePages,
    ...Object.values(candidate.fieldEvidence).flatMap((entries) =>
      entries.flatMap((entry) => entry.sourcePages),
    ),
  ]);
}

function validateSourceReviewAttestation(
  candidate: PurchaseOrderCandidate,
  attestation: SourceReviewAttestation,
): void {
  if (
    attestation.verifiedLineCount !== candidate.lines.length ||
    attestation.confirmedFromOriginal !== true ||
    new Set(attestation.reviewedSourcePages).size !== attestation.reviewedSourcePages.length ||
    new Set(attestation.reviewedSourceRowIds).size !== attestation.reviewedSourceRowIds.length ||
    attestation.reviewedSourceRowIds.length !== candidate.lines.length ||
    !candidate.lines.every((line) => attestation.reviewedSourceRowIds.includes(line.sourceRowId)) ||
    ![...sourcePages(candidate)].every((page) => attestation.reviewedSourcePages.includes(page))
  )
    throw new ContractError(
      400,
      "Original source review must cover every candidate row and source page.",
      "INVALID_INPUT",
    );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function diagnosticsFor(candidate: PurchaseOrderCandidate, expectedLineCount: number): string[] {
  const issues: string[] = [];
  if (candidate.lines.length !== expectedLineCount) issues.push("LINE_COUNT_MISMATCH");
  if (new Set(candidate.lines.map((line) => line.sourceRowId)).size !== candidate.lines.length)
    issues.push("DUPLICATE_SOURCE_ROW_ID");
  if (candidate.lines.some((line) => line.uncertain)) issues.push("UNCERTAIN_LINE");
  if (
    candidate.lines.some((line) => {
      const quantity = line.quantity === null ? null : decimalParts(line.quantity).coefficient;
      const unitPrice = line.unitPrice === null ? null : decimalParts(line.unitPrice).coefficient;
      return (quantity !== null && quantity <= 0n) || (unitPrice !== null && unitPrice < 0n);
    })
  )
    issues.push("INVALID_LINE_MEASURE");
  if (candidate.lines.some((line) => line.sourcePages.length === 0))
    issues.push("MISSING_SOURCE_PAGE");
  const requiredFacts = [
    candidate.header.documentNumber,
    candidate.header.issueDate,
    candidate.header.title,
    candidate.header.currency,
    candidate.buyer.name,
    candidate.seller.name,
    candidate.totals.gross,
    candidate.totals.discount,
    candidate.totals.net,
    candidate.totals.tax,
    candidate.totals.total,
    ...candidate.lines.flatMap((line) => [
      line.description,
      line.quantity,
      line.unit,
      line.unitPrice,
      line.grossAmount,
      line.discountAmount,
      line.netAmount,
    ]),
  ];
  if (requiredFacts.some((value) => !complete(value))) issues.push("MISSING_REQUIRED_FACT");
  if (
    candidate.lines.every(
      (line) =>
        complete(line.grossAmount) && complete(line.discountAmount) && complete(line.netAmount),
    ) &&
    candidate.lines.some((line) => {
      const { grossAmount, discountAmount, netAmount } = line;
      return (
        complete(grossAmount) &&
        complete(discountAmount) &&
        complete(netAmount) &&
        !equalExactDecimals(addExactDecimals([grossAmount, discountAmount]), netAmount)
      );
    })
  )
    issues.push("LINE_AMOUNT_MISMATCH");
  if (
    candidate.lines.some(
      (line) =>
        complete(line.quantity) &&
        complete(line.unitPrice) &&
        complete(line.grossAmount) &&
        !equalExactDecimals(multiplyExactDecimals(line.quantity, line.unitPrice), line.grossAmount),
    )
  )
    issues.push("LINE_GROSS_MISMATCH");
  const grossAmounts = candidate.lines.map((line) => line.grossAmount);
  const grossTotal = candidate.totals.gross;
  if (grossAmounts.every(complete) && complete(grossTotal)) {
    if (!equalExactDecimals(addExactDecimals(grossAmounts), grossTotal))
      issues.push("GROSS_TOTAL_MISMATCH");
  }
  const discounts = candidate.lines.map((line) => line.discountAmount);
  const discountTotal = candidate.totals.discount;
  if (discounts.every(complete) && complete(discountTotal)) {
    if (!equalExactDecimals(addExactDecimals(discounts), discountTotal))
      issues.push("DISCOUNT_TOTAL_MISMATCH");
  }
  const lineAmounts = candidate.lines.map((line) => line.netAmount);
  const netTotal = candidate.totals.net;
  if (lineAmounts.every(complete) && complete(netTotal)) {
    const computed = addExactDecimals(lineAmounts);
    if (!equalExactDecimals(computed, netTotal)) issues.push("LINE_NET_TOTAL_MISMATCH");
  }
  const tax = candidate.totals.tax;
  const total = candidate.totals.total;
  if (complete(netTotal) && complete(tax) && complete(total)) {
    if (!equalExactDecimals(addExactDecimals([netTotal, tax]), total))
      issues.push("NET_TAX_TOTAL_MISMATCH");
  }
  return issues;
}

export function createDocumentRevision(
  current: ContractDocumentRevision | null,
  input: Readonly<{
    action: "save" | "confirm";
    expectedVersion: number;
    expectedLineCount: number;
    candidate: PurchaseOrderCandidate;
    source: ContractDocumentRevision["source"];
    acknowledgement?: Readonly<{ reason: string }>;
    sourceReviewAttestation?: SourceReviewAttestation;
    id: string;
    documentId: string;
    repositoryId: string;
    actorUserId: string;
    at: number;
  }>,
): ContractDocumentRevision {
  if ((current?.version ?? 0) !== input.expectedVersion)
    throw new ContractError(409, "Document version conflict.", "VERSION_CONFLICT");
  if (current?.state === "CONFIRMED")
    throw new ContractError(409, "A confirmed document cannot be edited.", "LIFECYCLE_CONFLICT");
  if (input.action === "confirm") {
    if (!current || current.state !== "DRAFT")
      throw new ContractError(409, "Save a draft before confirming it.", "LIFECYCLE_CONFLICT");
    if (
      input.expectedLineCount !== current.expectedLineCount ||
      canonical(input.source) !== canonical(current.source) ||
      canonical(input.candidate) !== canonical(current.candidate)
    )
      throw new ContractError(
        409,
        "Confirmation must preserve the reviewed source and draft facts.",
        "SOURCE_INVALID",
      );
    if (!input.sourceReviewAttestation)
      throw new ContractError(
        400,
        "Original source review attestation is required to confirm.",
        "INVALID_INPUT",
      );
    validateSourceReviewAttestation(input.candidate, input.sourceReviewAttestation);
  }
  if (!Number.isSafeInteger(input.expectedLineCount) || input.expectedLineCount < 1)
    throw new ContractError(400, "Expected line count must be positive.", "INVALID_INPUT");
  const diagnostics = diagnosticsFor(input.candidate, input.expectedLineCount);
  if (input.action === "confirm") {
    if (
      input.candidate.lines.length !== input.expectedLineCount ||
      diagnostics.includes("MISSING_REQUIRED_FACT") ||
      diagnostics.includes("MISSING_SOURCE_PAGE") ||
      diagnostics.includes("DUPLICATE_SOURCE_ROW_ID") ||
      diagnostics.includes("UNCERTAIN_LINE") ||
      diagnostics.includes("INVALID_LINE_MEASURE")
    )
      throw new ContractError(
        400,
        "Complete and certain purchase order facts are required to confirm.",
        "INVALID_INPUT",
      );
    if (diagnostics.length && !input.acknowledgement?.reason.trim())
      throw new ContractError(
        400,
        "A discrepancy acknowledgement reason is required.",
        "INVALID_INPUT",
      );
  }
  return {
    schemaVersion: 1,
    id: input.id,
    documentId: input.documentId,
    repositoryId: input.repositoryId,
    version: (current?.version ?? 0) + 1,
    parentRevisionId: current?.id ?? null,
    actorUserId: input.actorUserId,
    at: input.at,
    state: input.action === "confirm" ? "CONFIRMED" : "DRAFT",
    source: { ...input.source },
    expectedLineCount: input.expectedLineCount,
    candidate: structuredClone(input.candidate),
    diagnostics,
    acknowledgementReason:
      input.action === "confirm" && diagnostics.length > 0
        ? (input.acknowledgement?.reason.trim() ?? null)
        : null,
    sourceReviewAttestation:
      input.action === "confirm" && input.sourceReviewAttestation
        ? structuredClone(input.sourceReviewAttestation)
        : null,
  };
}

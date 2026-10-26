import type {
  DocumentSource,
  PurchaseOrderCandidate,
  SourceReviewAttestation,
} from "../../domain/document-intake.js";
import { PURCHASE_ORDER_CATEGORIES } from "../../domain/document-intake.js";

import type { DocumentIntakeRevisionDto } from "../dto/document-intake.js";

export type DocumentIntakeInput = Readonly<{
  action: "save" | "confirm";
  repositoryId: string;
  documentId: string;
  requestId: string;
  intentFingerprint: string;
  expectedVersion: number;
  source: DocumentSource;
  expectedLineCount: number;
  candidate: PurchaseOrderCandidate;
  acknowledgement?: Readonly<{ reason: string }>;
  sourceReviewAttestation?: SourceReviewAttestation;
}>;

export type DocumentReceipt = Readonly<{
  requestId: string;
  repositoryId: string;
  documentId: string;
  revisionId: string;
  version: number;
  fingerprint: string;
  intentFingerprint: string;
  source: DocumentSource;
}>;

export interface ContractDocumentIntake {
  read(
    actor: string,
    query: Readonly<{ repositoryId: string; documentId: string; revisionId?: string }>,
  ): Promise<DocumentIntakeRevisionDto>;
  receipt(
    actor: string,
    scope: Readonly<{ repositoryId: string; documentId: string; requestId: string }>,
  ): Promise<DocumentReceipt | null>;
  submit(actor: string, input: unknown): Promise<DocumentReceipt>;
}

export const purchaseOrderExtractionSchemaId = "purchase-order/v1" as const;
export const purchaseOrderExtractionSchemaVersion = 1 as const;

// Kept as plain JSON Schema data so providers need no SDK dependency.
export const purchaseOrderExtractionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: purchaseOrderExtractionSchemaId,
  type: "object",
  additionalProperties: false,
  required: [
    "header",
    "buyer",
    "seller",
    "lines",
    "totals",
    "terms",
    "fieldEvidence",
    "corrections",
  ],
  properties: {
    header: { $ref: "#/$defs/header" },
    buyer: { $ref: "#/$defs/party" },
    seller: { $ref: "#/$defs/party" },
    lines: { type: "array", items: { $ref: "#/$defs/line" } },
    totals: { $ref: "#/$defs/totals" },
    terms: {
      type: "object",
      additionalProperties: false,
      required: ["text", "sourcePages"],
      properties: { text: { type: ["string", "null"] }, sourcePages: { $ref: "#/$defs/pages" } },
    },
    fieldEvidence: {
      type: "object",
      additionalProperties: { type: "array", items: { $ref: "#/$defs/evidence" } },
    },
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "original", "replacement", "reason"],
        properties: {
          field: { type: "string" },
          original: { type: ["string", "null"] },
          replacement: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
  $defs: {
    nullableText: { type: ["string", "null"] },
    decimal: { type: ["string", "null"], pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$" },
    pages: { type: "array", items: { type: "integer", minimum: 1 }, uniqueItems: true },
    header: {
      type: "object",
      additionalProperties: false,
      required: ["documentNumber", "revision", "issueDate", "title", "currency"],
      properties: {
        documentNumber: { $ref: "#/$defs/nullableText" },
        revision: { $ref: "#/$defs/nullableText" },
        issueDate: { type: ["string", "null"], format: "date" },
        title: { $ref: "#/$defs/nullableText" },
        currency: { $ref: "#/$defs/nullableText" },
      },
    },
    party: {
      type: "object",
      additionalProperties: false,
      required: ["name", "registrationNumber"],
      properties: {
        name: { $ref: "#/$defs/nullableText" },
        registrationNumber: { $ref: "#/$defs/nullableText" },
      },
    },
    line: {
      type: "object",
      additionalProperties: false,
      required: [
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
      ],
      properties: {
        sourceRowId: { type: "string", minLength: 1 },
        itemNumber: { $ref: "#/$defs/nullableText" },
        category: {
          anyOf: [{ type: "string", enum: [...PURCHASE_ORDER_CATEGORIES] }, { type: "null" }],
        },
        materialCode: { $ref: "#/$defs/nullableText" },
        description: { $ref: "#/$defs/nullableText" },
        quantity: { $ref: "#/$defs/decimal" },
        unit: { $ref: "#/$defs/nullableText" },
        unitPrice: { $ref: "#/$defs/decimal" },
        grossAmount: { $ref: "#/$defs/decimal" },
        discountAmount: { $ref: "#/$defs/decimal" },
        netAmount: { $ref: "#/$defs/decimal" },
        deliveryDate: { type: ["string", "null"], format: "date" },
        sourcePages: { $ref: "#/$defs/pages" },
        uncertain: { type: "boolean" },
      },
    },
    totals: {
      type: "object",
      additionalProperties: false,
      required: ["gross", "discount", "net", "tax", "total"],
      properties: {
        gross: { $ref: "#/$defs/decimal" },
        discount: { $ref: "#/$defs/decimal" },
        net: { $ref: "#/$defs/decimal" },
        tax: { $ref: "#/$defs/decimal" },
        total: { $ref: "#/$defs/decimal" },
      },
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["sourcePages", "rawText", "confidence"],
      properties: {
        sourcePages: { $ref: "#/$defs/pages" },
        rawText: { $ref: "#/$defs/nullableText" },
        confidence: { $ref: "#/$defs/nullableText" },
      },
    },
  },
} as const;

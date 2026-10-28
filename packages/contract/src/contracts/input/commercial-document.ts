import { z } from "zod";
import {
  type CommercialDocumentContent,
  isValidPricingScope,
  validateCommercialDocumentGraph,
} from "../../domain/commercial-document.js";
import {
  hasConsistentMissingReason,
  hasEvidenceForFact,
} from "../../domain/commercial-document-values.js";
import {
  commercialFieldValueSchema,
  currencyCodeSchema,
  dateOnlySchema,
  decimalStringSchema,
  evidenceReferenceSchema,
  moneySchema,
} from "./commercial-document-values.js";

const text = z.string().trim().min(1).max(8000);
const refs = z.array(evidenceReferenceSchema).max(256);
const field = commercialFieldValueSchema;
const extensionBase = {
  fieldId: z.uuid(),
  label: z.string().trim().min(1).max(128),
  missingReason: z.enum(["NOT_PRESENT", "UNREADABLE", "AMBIGUOUS"]).nullable(),
  unitLabel: z.string().max(128).nullable(),
  evidenceRefs: refs,
};
const extensionSchema = z
  .discriminatedUnion("valueType", [
    z.strictObject({
      ...extensionBase,
      valueType: z.literal("TEXT"),
      value: z.string().max(2048).nullable(),
    }),
    z.strictObject({
      ...extensionBase,
      valueType: z.literal("DECIMAL"),
      value: decimalStringSchema.nullable(),
    }),
    z.strictObject({
      ...extensionBase,
      valueType: z.literal("DATE"),
      value: dateOnlySchema.nullable(),
    }),
    z.strictObject({
      ...extensionBase,
      valueType: z.literal("BOOLEAN"),
      value: z.boolean().nullable(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (!hasConsistentMissingReason(value.value, value.missingReason))
      ctx.addIssue({ code: "custom", message: "Extension missing reason mismatch." });
    if (!hasEvidenceForFact(value.value, value.evidenceRefs))
      ctx.addIssue({ code: "custom", message: "Extension facts require evidence." });
  });
const extensions = (max: number) => z.array(extensionSchema).max(max);
const pricingScope = z
  .strictObject({
    scopeType: z.enum(["DOCUMENT", "SECTION", "ROW"]),
    sectionId: z.uuid().nullable(),
    rowId: z.uuid().nullable(),
  })
  .refine(isValidPricingScope, "Invalid pricing scope.");
const rowBase = {
  rowId: z.uuid(),
  sectionId: z.uuid().nullable(),
  position: z.number().int().nonnegative(),
  evidenceRefs: refs.min(1),
  extensionFields: extensions(16),
  derivedFromRowIds: z.array(z.uuid()).max(1000).optional(),
};
const rowSchema = z.discriminatedUnion("rowType", [
  z.strictObject({
    ...rowBase,
    rowType: z.literal("ITEM"),
    itemNumber: field(text),
    referenceCode: field(text),
    description: field(text),
    quantity: field(decimalStringSchema),
    unitLabel: field(z.string().min(1).max(128)),
    unitPrice: field(moneySchema),
    lineAmount: field(moneySchema),
    deliveryDate: field(dateOnlySchema),
  }),
  z.strictObject({
    ...rowBase,
    rowType: z.literal("CHARGE"),
    chargeKind: z.enum(["DISCOUNT", "TAX", "FREIGHT", "ROUNDING", "OTHER"]),
    scope: pricingScope,
    signedAmount: field(moneySchema),
    rate: field(decimalStringSchema),
    description: field(text),
  }),
  z.strictObject({
    ...rowBase,
    rowType: z.literal("SUBTOTAL"),
    scope: pricingScope,
    reportedAmount: field(moneySchema),
    label: field(text),
  }),
  z.strictObject({ ...rowBase, rowType: z.literal("NOTE"), text: field(text) }),
]);

/** Contract-owned fact shape and graph; source qualification is checked by the use case. */
export const commercialDocumentContentSchema = z
  .strictObject({
    documentKind: z.enum(["PURCHASE_ORDER", "QUOTATION", "ESTIMATE", "CONTRACT", "UNCLASSIFIED"]),
    header: z.strictObject({
      documentNumber: field(text),
      documentRevisionLabel: field(text),
      title: field(text),
      issueDate: field(dateOnlySchema),
      validUntilDate: field(dateOnlySchema),
      defaultCurrencyCode: field(currencyCodeSchema),
    }),
    parties: z
      .array(
        z.strictObject({
          partyId: z.uuid(),
          roles: z
            .array(z.enum(["ISSUER", "RECIPIENT", "BUYER", "SELLER", "OTHER"]))
            .min(1)
            .max(5),
          name: field(text),
          identifiers: z
            .array(
              z.strictObject({
                scheme: z.enum(["TW_TAX_ID", "VAT_ID", "OTHER"]),
                label: z.string().max(128).nullable(),
                value: field(text),
              }),
            )
            .max(64),
          postalAddress: field(text),
          extensionFields: extensions(64),
        }),
      )
      .max(64),
    sections: z
      .array(
        z.strictObject({
          sectionId: z.uuid(),
          parentSectionId: z.uuid().nullable(),
          position: z.number().int().nonnegative(),
          title: field(text),
          evidenceRefs: refs.min(1),
        }),
      )
      .max(1000),
    rows: z.array(rowSchema).max(1000),
    selectionGroups: z
      .array(
        z.strictObject({
          selectionGroupId: z.uuid(),
          label: text,
          itemRowIds: z.array(z.uuid()).min(1).max(1000),
          selectionMode: z.enum(["ONE_OF", "ANY_OF", "UNSPECIFIED"]),
          evidenceRefs: refs.min(1),
        }),
      )
      .max(1000),
    totals: z
      .array(
        z.strictObject({
          summaryId: z.uuid(),
          scope: pricingScope,
          currencyCode: currencyCodeSchema.nullable(),
          amountBasis: z.enum(["TAX_EXCLUSIVE", "TAX_INCLUSIVE", "MIXED", "UNSPECIFIED"]),
          itemsAmount: field(decimalStringSchema),
          nonTaxAdjustmentsAmount: field(decimalStringSchema),
          taxAmount: field(decimalStringSchema),
          payableAmount: field(decimalStringSchema),
          evidenceRefs: refs.min(1),
        }),
      )
      .max(1000),
    terms: z
      .array(
        z.strictObject({
          termId: z.uuid(),
          termKind: z.enum(["PAYMENT", "DELIVERY", "VALIDITY", "WARRANTY", "OTHER"]),
          text: field(text),
        }),
      )
      .max(64),
    extensionFields: extensions(64),
  })
  .superRefine((content, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 393_216)
      ctx.addIssue({ code: "custom", message: "Document UTF-8 byte budget exceeded." });
    for (const message of validateCommercialDocumentGraph(content))
      ctx.addIssue({ code: "custom", message });
  }) satisfies z.ZodType<CommercialDocumentContent>;

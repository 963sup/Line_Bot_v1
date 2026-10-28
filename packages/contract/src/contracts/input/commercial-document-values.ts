import { z } from "zod";
import {
  hasConsistentCorrectionReason,
  hasConsistentMissingReason,
  hasEvidenceForFact,
} from "../../domain/commercial-document-values.js";

/** Source decimals never pass through JavaScript floating point arithmetic. */
export const decimalStringSchema = z
  .string()
  .max(52)
  .superRefine((value, ctx) => {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Invalid decimal notation." });
      return;
    }
    const [integer = "", fraction = ""] = value.replace(/^-/, "").split(".");
    const significant = `${integer}${fraction}`.replace(/^0+/, "").length;
    if (fraction.length > 12 || significant > 38)
      ctx.addIssue({ code: "custom", message: "Decimal precision exceeded." });
  })
  .transform((value) => {
    const canonical = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
    return /^-?0$/.test(canonical) ? "0" : canonical;
  });

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.valueOf()) &&
      date.toISOString().slice(0, 10) === value &&
      !value.startsWith("0000-")
    );
  }, "Invalid Gregorian date.");

const currencyCodes = new Set(Intl.supportedValuesOf("currency"));
export const currencyCodeSchema = z
  .string()
  .refine((value) => currencyCodes.has(value), "Unknown ISO currency code.");
export const moneySchema = z.strictObject({
  amount: decimalStringSchema,
  currencyCode: currencyCodeSchema.nullable(),
});
export const evidenceReferenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("EXTRACTION"),
    extractionResultId: z.uuid(),
    observationId: z.uuid(),
  }),
  z.strictObject({ kind: z.literal("HUMAN"), evidenceId: z.uuid() }),
]);

/** Shape validation only; the owning document validates source/result membership. */
export function commercialFieldValueSchema<T>(valueSchema: z.ZodType<T>) {
  return z
    .strictObject({
      value: valueSchema.nullable(),
      missingReason: z.enum(["NOT_PRESENT", "UNREADABLE", "AMBIGUOUS"]).nullable(),
      evidenceRefs: z.array(evidenceReferenceSchema).max(256),
      origin: z.enum(["EXTRACTION", "HUMAN_CORRECTION"]),
      correctionReason: z.string().trim().min(1).max(2048).nullable(),
    })
    .superRefine((field, ctx) => {
      if (!hasConsistentMissingReason(field.value, field.missingReason))
        ctx.addIssue({
          code: "custom",
          path: ["missingReason"],
          message: "Missing values require a reason; present values must not have one.",
        });
      if (!hasEvidenceForFact(field.value, field.evidenceRefs))
        ctx.addIssue({
          code: "custom",
          path: ["evidenceRefs"],
          message: "Facts require source evidence.",
        });
      if (!hasConsistentCorrectionReason(field.origin, field.correctionReason))
        ctx.addIssue({
          code: "custom",
          path: ["correctionReason"],
          message: "Only human corrections require a correction reason.",
        });
    });
}

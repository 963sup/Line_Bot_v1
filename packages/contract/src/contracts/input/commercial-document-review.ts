import { z } from "zod";
import { evidenceReferenceSchema } from "./commercial-document-values.js";

const documentCoverageReviewSchema = z.strictObject({
  confirmedAgainstOriginal: z.literal(true),
  reviewedPageNumbers: z.array(z.number().int().positive()).max(24),
  reviewedEvidenceRefs: z.array(evidenceReferenceSchema),
  reviewedItemRowIds: z.array(z.uuid()).max(1000),
  sourceItemCount: z.number().int().nonnegative().nullable(),
});
export const documentVerificationReviewSchema = documentCoverageReviewSchema.extend({
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgements: z
    .array(
      z.strictObject({
        code: z.string().min(1).max(160),
        reason: z.string().trim().min(1).max(2048),
      }),
    )
    .max(1000),
});

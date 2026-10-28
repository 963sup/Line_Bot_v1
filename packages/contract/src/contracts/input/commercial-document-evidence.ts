import { z } from "zod";

const sourceSchema = z.strictObject({
  fileId: z.uuid(),
  fileRevisionId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const commercialDocumentEvidenceContextSchema = z.strictObject({
  source: sourceSchema,
  extractionResultId: z.uuid(),
  pageCount: z.number().int().positive().max(24),
  observations: z.array(
    z.strictObject({ observationId: z.uuid(), pageNumber: z.number().int().positive() }),
  ),
  humanEvidence: z
    .array(
      z.strictObject({
        evidenceId: z.uuid(),
        source: sourceSchema,
        pageNumber: z.number().int().positive(),
      }),
    )
    .max(256),
});

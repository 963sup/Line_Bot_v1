import { z } from "zod";
import { documentVerificationReviewSchema } from "../../contracts/input/commercial-document-review.js";
import type { CommercialDocumentReviewSource } from "../../contracts/output/commercial-document-review.js";
import { ContractError } from "../../domain/error.js";
import { validateCommercialDocument } from "../commercial-document-validation.js";

const inputSchema = z.strictObject({
  repositoryId: z.string().min(1).max(128),
  extractionResultId: z.uuid(),
  purpose: z.enum(["DRAFT", "VERIFY"]),
  content: z.unknown(),
  sourceReview: documentVerificationReviewSchema.optional(),
});

/** Read-only business assessment. The host supplies identity; the source port enforces
 * current access. Revision writes/CAS/receipts belong to separate transactional commands.
 */
export async function assessCommercialDocument(
  ctx: Readonly<{ actorUserId: string; traceId: string }>,
  input: unknown,
  source: CommercialDocumentReviewSource,
) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new ContractError(400, "Invalid commercial document assessment.", "INVALID_INPUT");
  const command = parsed.data;
  const evidence = await source.readQualifiedEvidence(ctx.actorUserId, {
    repositoryId: command.repositoryId,
    extractionResultId: command.extractionResultId,
  });
  if (evidence.extractionResultId !== command.extractionResultId)
    throw new ContractError(409, "Qualified extraction result does not match.", "SOURCE_INVALID");
  return validateCommercialDocument(
    command.content,
    command.purpose,
    evidence,
    command.sourceReview,
  );
}

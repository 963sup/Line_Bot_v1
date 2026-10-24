/**
 * Immutable evidence produced by the retired File processing flow.
 * Intelligence owns the interpretation result; File remains the owner of the
 * exact original revision named by this evidence.
 */
type SavedProcessingReference = Readonly<{
  runId: string;
  processingRevisionId: string;
  observationId: string;
}>;

export type VerifiedSavedProcessing = SavedProcessingReference &
  Readonly<{
    repositoryId: string;
    fileId: string;
    fileRevisionId: string;
    fileSha256: string;
    uncertain: boolean;
  }>;

/**
 * Transaction-bound, authorized access to a saved historical extraction.
 * Consumers receive provenance only, never a File persistence capability.
 */
export interface ProcessingHistoryReader {
  verifySaved(
    actor: string,
    repositoryId: string,
    reference: SavedProcessingReference,
  ): Promise<VerifiedSavedProcessing>;
}

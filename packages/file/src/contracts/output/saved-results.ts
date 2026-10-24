/** File owns the evidence and access decision; consumers only pin a verified immutable saved result. */
type SavedResultReference = Readonly<{
  runId: string;
  processingRevisionId: string;
  observationId: string;
}>;

type VerifiedSavedResult = SavedResultReference &
  Readonly<{
    repositoryId: string;
    fileId: string;
    fileRevisionId: string;
    fileSha256: string;
    uncertain: boolean;
  }>;

export interface FileSavedResultReader {
  verifySaved(
    actor: string,
    repositoryId: string,
    reference: SavedResultReference,
  ): Promise<VerifiedSavedResult>;
}

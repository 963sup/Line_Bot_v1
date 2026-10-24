/** File owns retained processing evidence and its access decision. */
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

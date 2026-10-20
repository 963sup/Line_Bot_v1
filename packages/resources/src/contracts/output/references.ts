type ObjectReference = Readonly<{ objectId: string; revisionId: string }>;

type ObjectReferenceSummary = Readonly<{
  objectId: string;
  revisionId: string;
  pinnedVersion: number;
  name: string;
  typeId: string;
  typeName: string;
  archived: boolean;
  currentRevisionId: string;
  currentVersion: number;
  hasNewerRevision: boolean;
}>;

export interface ObjectReferenceReader {
  verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly ObjectReference[],
    policy: Readonly<{ allowArchived: boolean }>,
  ): Promise<readonly ObjectReferenceSummary[]>;
}

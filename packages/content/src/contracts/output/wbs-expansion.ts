type ContentWbsSourceNode = Readonly<{
  id: string;
  parentId: string | null;
  position: number;
  kind: "SUBJECT" | "OBJECT" | "SUBOBJECT" | "WORK" | "TASK";
  title: string;
  body: string;
}>;

type ContentWbsSourceRow = Readonly<{
  documentId: string;
  revisionId: string;
  sourceRowId: string;
  disposition: "CONTENT_WORK" | "COMMERCIAL_ONLY";
  nodeIds: readonly string[];
}>;

type ContentWbsSourceRevision = Readonly<{
  repositoryId: string;
  revisionId: string;
  version: number;
  nodes: readonly ContentWbsSourceNode[];
  sourceRows: readonly ContentWbsSourceRow[];
}>;

/** WBS consumes one authorized immutable Content revision as a detached planning snapshot. */
export interface ContentWbsExpansionReader {
  read(actor: string, repositoryId: string, revisionId: string): Promise<ContentWbsSourceRevision>;
}

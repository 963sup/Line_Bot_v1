import type { ResourceReferenceReader } from "@line_bot_v1/resources/contracts/output/resource-references";
import type { ContentPlanRevision } from "../../domain/plan.js";

interface ContentPlans {
  load(): Promise<ContentPlanRevision | null>;
  hasContractDocumentImport(documentId: string, revisionId: string): Promise<boolean>;
  save(next: ContentPlanRevision, expectedVersion: number): Promise<void>;
}

export interface ContentPlanReads {
  read(
    userId: string,
    query: Readonly<{ repositoryId: string; revisionId?: string }>,
  ): Promise<ContentPlanRevision>;
  history(
    userId: string,
    query: Readonly<{ repositoryId: string }>,
    before?: number,
  ): Promise<{ revisions: readonly ContentPlanRevision[]; next: number | null }>;
}

export interface ContractDocumentExpansionReader {
  readConfirmed(
    actor: string,
    repositoryId: string,
    documentId: string,
    revisionId: string,
  ): Promise<import("../../domain/plan.js").ContractDocumentExpansion>;
}

export type ContractDocumentSource = Readonly<{
  id: string;
  documentId: string;
  state: string;
  source: Readonly<{ fileId: string; fileRevisionId: string; fileSha256: string }>;
  candidate: Readonly<{
    header: Readonly<{ title: string | null; documentNumber: string | null }>;
    lines: readonly Readonly<{
      sourceRowId: string;
      description: string | null;
      quantity: string | null;
      unit: string | null;
      category: string | null;
      uncertain: boolean;
    }>[];
  }>;
}>;

export interface ContractDocumentSourceReader {
  read(
    actor: string,
    repositoryId: string,
    documentId: string,
    revisionId: string,
  ): Promise<ContractDocumentSource | null>;
}

export interface ContentPlanTransaction {
  readonly scope: { repositoryId: string; permissions: readonly string[]; archived: boolean };
  readonly plans: ContentPlans;
  readonly resources: ResourceReferenceReader;
  readonly contractDocuments: ContractDocumentExpansionReader;
  nextId(): string;
  replay(): Promise<{ requestId: string; revision: ContentPlanRevision } | null>;
  record(revision: ContentPlanRevision): Promise<void>;
}

export interface ContentPlanTransactions {
  transact<T>(
    userId: string,
    scope: Readonly<{ repositoryId: string }>,
    evidence: Readonly<{ requestId: string; payload: string }>,
    operation: (tx: ContentPlanTransaction) => Promise<T>,
  ): Promise<T>;
}

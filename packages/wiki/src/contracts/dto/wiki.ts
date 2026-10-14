import type { WikiEdit, WikiRevision } from "../../domain/wiki-page.js";

export type WikiCommand = WikiEdit &
  Readonly<{ repositoryId: string; pageId: string; requestId: string; expectedVersion: number }>;
export type WikiReceipt = Readonly<{ requestId: string; revision: WikiRevision }>;
export type WikiPageSummary = Readonly<{
  pageId: string;
  title: string;
  version: number;
  archived: boolean;
  updatedAt: number;
}>;
export type WikiQuery = Readonly<{ repositoryId: string; pageId: string; revisionId?: string }>;
export type WikiHistory = Readonly<{ revisions: readonly WikiRevision[]; next: number | null }>;

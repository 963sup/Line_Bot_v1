import type { WikiEdit } from "../../domain/wiki-page.js";

export type WikiRevisionDto = Readonly<{
  id: string;
  pageId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: WikiEdit["action"];
  title: string;
  body: string;
  archived: boolean;
}>;

export type WikiReceipt = Readonly<{ requestId: string; revision: WikiRevisionDto }>;
export type WikiPageSummary = Readonly<{
  pageId: string;
  title: string;
  version: number;
  archived: boolean;
  updatedAt: number;
}>;
export type WikiHistory = Readonly<{ revisions: readonly WikiRevisionDto[]; next: number | null }>;

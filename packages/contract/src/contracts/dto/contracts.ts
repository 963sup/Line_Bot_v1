import type { ResourceQuantityBasis } from "@line_bot_v1/resources/contracts/output/engineering-references";

type ContractLineDto = Readonly<{
  lineId: string;
  resource: ResourceQuantityBasis;
  agreedQuantity: string;
}>;

export type ContractRevisionDto = Readonly<{
  revisionId: string;
  contractId: string;
  repositoryId: string;
  version: number;
  parentRevisionId: string | null;
  actorUserId: string;
  at: number;
  action: "create" | "edit" | "activate" | "close";
  state: "DRAFT" | "ACTIVE" | "CLOSED";
  title: string;
  body: string;
  lines: readonly ContractLineDto[];
}>;

export type ContractReceipt = Readonly<{ requestId: string; revision: ContractRevisionDto }>;

export type ContractSummary = Readonly<{
  contractId: string;
  title: string;
  state: "DRAFT" | "ACTIVE" | "CLOSED";
  version: number;
  updatedAt: number;
}>;

export type ContractList = Readonly<{
  contracts: readonly ContractSummary[];
  next: string | null;
}>;

export type ContractHistory = Readonly<{
  revisions: readonly ContractRevisionDto[];
  next: number | null;
}>;

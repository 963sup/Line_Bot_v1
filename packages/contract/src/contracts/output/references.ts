import type { ContractLineBasis } from "../../domain/line-reference.js";

export type ContractLineReference = Readonly<{
  contractId: string;
  contractRevisionId: string;
  lineId: string;
}>;

export interface ContractReferenceReader {
  verifyLine(
    userId: string,
    repositoryId: string,
    ref: ContractLineReference,
    policy: Readonly<{ requireActive: boolean }>,
  ): Promise<ContractLineBasis>;
}

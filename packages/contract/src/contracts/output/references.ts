import type { ResourceQuantityBasis } from "@line_bot_v1/resources/contracts/output/engineering-references";

export type ContractLineReference = Readonly<{
  contractId: string;
  contractRevisionId: string;
  lineId: string;
}>;

export type ContractLineBasis = Readonly<{
  contractId: string;
  contractRevisionId: string;
  lineId: string;
  resource: ResourceQuantityBasis;
  agreedQuantity: string;
}>;

export interface ContractReferenceReader {
  verifyLine(
    userId: string,
    repositoryId: string,
    ref: ContractLineReference,
    policy: Readonly<{ requireActive: boolean }>,
  ): Promise<ContractLineBasis>;
}

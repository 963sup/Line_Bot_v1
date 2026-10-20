import type { QuantityUnit } from "../../domain/quantity.js";

export type ResourceQuantityBasis = Readonly<{
  resourceId: string;
  resourceRevisionId: string;
  resourceVersion: number;
  name: string;
  measure: Readonly<{
    id: string;
    name: string;
    subject: string;
    unit: QuantityUnit;
  }>;
  sourceQuantity: string;
}>;

export interface ResourceQuantityReader {
  verifyPinned(
    userId: string,
    repositoryId: string,
    references: readonly Readonly<{ resourceId: string; resourceRevisionId: string }>[],
    policy: Readonly<{ allowArchived: boolean }>,
  ): Promise<readonly ResourceQuantityBasis[]>;
}

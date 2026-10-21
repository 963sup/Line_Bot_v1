import type { QuantityUnit } from "./quantity.js";

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

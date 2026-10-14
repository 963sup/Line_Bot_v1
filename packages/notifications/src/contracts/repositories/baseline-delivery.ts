import type { BaselineDeliveryResult, BaselineNotification } from "../output/baseline-delivery.js";
export type DeliveryClaim = {
  token: string;
  key: string;
  target: string;
  payload: string;
  retryKey: string;
};
export interface BaselineDeliveryStore {
  create(input: BaselineNotification, payload: string, now: number): Promise<void>;
  claim(
    key: string,
    now: number,
  ): Promise<{ result: BaselineDeliveryResult; claim: DeliveryClaim | null }>;
  complete(
    claim: DeliveryClaim,
    outcome: "accepted" | "retry" | "failed" | "unavailable" | "unknown" | "cancelled",
    now: number,
  ): Promise<BaselineDeliveryResult>;
  cancel(key: string, now: number): Promise<void>;
}

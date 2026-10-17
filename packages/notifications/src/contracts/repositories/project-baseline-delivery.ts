import type {
  ProjectBaselineDeliveryResult,
  ProjectBaselineNotification,
} from "../output/project-baseline-delivery.js";
export type DeliveryClaim = {
  token: string;
  key: string;
  target: string;
  payload: string;
  retryKey: string;
};
export interface ProjectBaselineDeliveryStore {
  create(input: ProjectBaselineNotification, payload: string, now: number): Promise<void>;
  claim(
    key: string,
    now: number,
  ): Promise<{ result: ProjectBaselineDeliveryResult; claim: DeliveryClaim | null }>;
  complete(
    claim: DeliveryClaim,
    outcome: "accepted" | "retry" | "failed" | "unavailable" | "unknown" | "cancelled",
    now: number,
  ): Promise<ProjectBaselineDeliveryResult>;
  cancel(key: string, now: number): Promise<void>;
}

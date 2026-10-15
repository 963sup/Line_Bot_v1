export type IntakeTime = {
  timezone: "Asia/Taipei";
  local: string;
  weekday: string;
};

/** One isolated model conversation; the use case decides when each stage runs. */
export interface IntakeModel {
  requestTime(signal: AbortSignal): Promise<void>;
  draftIssue(time: IntakeTime, signal: AbortSignal): Promise<unknown>;
}

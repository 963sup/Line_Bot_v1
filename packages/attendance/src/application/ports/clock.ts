import type {
  AttendanceAction,
  AttendanceRecordView,
  AttendanceView,
  MenuState,
  Workplace,
} from "../../domain.js";

export type AttendanceInput = { requestId: string; expectedVersion: number; location: unknown };
export type AttendanceSnapshot = {
  attendance: AttendanceView;
  version: number;
  sites: Workplace[];
};
export type AttendanceResult = AttendanceSnapshot & { credited: number; replayed: boolean };
export interface AttendanceStore {
  prepare(
    memberId: string,
    now: number,
  ): Promise<{ version: number; working: boolean; sites: Workplace[] }>;
  snapshot(memberId: string, now: number): Promise<AttendanceSnapshot>;
  execute(
    memberId: string,
    action: AttendanceAction,
    input: AttendanceInput,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceResult>;
}
export interface AttendanceDependencies {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): AttendanceStore;
  now(): number;
  provider(): string;
}
export type AttendanceMenuJob = {
  uid: string;
  subject: string;
  state: MenuState;
  revision: number;
  token: string;
};
export type AttendanceNotification = { action: AttendanceAction; record: AttendanceRecordView };
export type AttendanceNotificationJob = {
  id: string;
  uid: string;
  subject: string;
  payload: AttendanceNotification;
  token: string;
};
export type NotificationOutcome = "accepted" | "retry" | "failed";
export interface AttendanceMaintenanceStore {
  claimMenu(now: number, provider: string, subject?: string): Promise<AttendanceMenuJob | null>;
  completeMenu(job: AttendanceMenuJob, success: boolean, now: number): Promise<boolean>;
  claimNotification(
    now: number,
    provider: string,
    subject?: string,
  ): Promise<AttendanceNotificationJob | null>;
  completeNotification(
    job: AttendanceNotificationJob,
    outcome: NotificationOutcome,
    now: number,
  ): Promise<boolean>;
}
export interface AttendanceMaintenanceDependencies {
  store(): AttendanceMaintenanceStore;
  now(): number;
  provider(): string;
  link(subject: string, state: MenuState): Promise<void>;
  notify(job: AttendanceNotificationJob): Promise<NotificationOutcome>;
}

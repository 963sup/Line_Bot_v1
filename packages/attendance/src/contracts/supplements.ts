import type { AttendancePoint } from "./clock.js";
import type {
  AttendanceSupplementReview,
  AttendanceSupplementSubmission,
} from "./input/attendance-supplement.js";

type AttendanceSupplementStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AttendanceSupplement = Readonly<{
  id: string;
  userId: string;
  repositoryId: string;
  kind: "new-session" | "close-session";
  sessionId: string | null;
  startedAt: number | null;
  endedAt: number;
  site: AttendancePoint;
  reason: string;
  submittedAt: number;
  status: AttendanceSupplementStatus;
  version: number;
  reviewerId: string | null;
  reviewedAt: number | null;
  reviewReason: string | null;
}>;

export type AttendanceSupplementInbox = Readonly<{
  viewerId: string;
  mine: AttendanceSupplement[];
  review: AttendanceSupplement[];
}>;

export type AttendanceSupplementReceipt = Readonly<{
  supplement: AttendanceSupplement;
  replayed: boolean;
}>;

export interface AttendanceSupplementStore {
  list(
    userId: string,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceSupplementInbox>;
  submit(
    userId: string,
    command: AttendanceSupplementSubmission,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceSupplementReceipt>;
  review(
    reviewerId: string,
    command: AttendanceSupplementReview,
    now: number,
    recipient: { provider: string; subject: string },
  ): Promise<AttendanceSupplementReceipt>;
}

export interface AttendanceSupplementDependencies {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): AttendanceSupplementStore;
  now(): number;
  provider(): string;
}

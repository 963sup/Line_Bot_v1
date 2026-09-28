export type AttendanceDay = {
  day: string;
  beforeMs: number;
  scheduledMs: number;
  afterMs: number;
  elapsedMs: number;
};

export type AttendanceSummary = {
  elapsedMs: number;
  beforeMs: number;
  scheduledMs: number;
  afterMs: number;
  crossesMidnight: boolean;
  provisional: boolean;
  days: AttendanceDay[];
};

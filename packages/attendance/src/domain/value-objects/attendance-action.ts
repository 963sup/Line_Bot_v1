const attendanceActionDefinitions = {
  clockIn: { operation: "clock-in", label: "上班" },
  clockOut: { operation: "clock-out", label: "下班" },
} as const;

export type AttendanceAction = keyof typeof attendanceActionDefinitions;
export type AttendanceOperation =
  (typeof attendanceActionDefinitions)[AttendanceAction]["operation"];

export function attendanceActionFromOperation(value: unknown): AttendanceAction | null {
  if (typeof value !== "string") return null;
  for (const action of Object.keys(attendanceActionDefinitions) as AttendanceAction[]) {
    if (attendanceActionDefinitions[action].operation === value) return action;
  }
  return null;
}

export function isAttendanceOperation(value: unknown): value is AttendanceOperation {
  return attendanceActionFromOperation(value) !== null;
}

export function attendanceOperation(action: AttendanceAction): AttendanceOperation {
  return attendanceActionDefinitions[action].operation;
}

export function attendanceActionLabel(action: AttendanceAction) {
  return attendanceActionDefinitions[action].label;
}

export function attendanceOperationLabel(operation: AttendanceOperation) {
  const action = attendanceActionFromOperation(operation);
  if (!action) throw new Error("Unknown Attendance operation");
  return attendanceActionLabel(action);
}

export function attendanceActionForWorking(working: boolean): AttendanceAction {
  return working ? "clockOut" : "clockIn";
}

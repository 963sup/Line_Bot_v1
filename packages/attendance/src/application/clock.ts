import type { AttendanceAction } from "../domain.js";
import type { AttendanceDependencies, AttendanceInput } from "./ports/clock.js";

export function createClockAttendance(deps: AttendanceDependencies) {
  async function run(subject: string, action: AttendanceAction, input: AttendanceInput) {
    const member = await deps.activeUser(subject);
    return deps
      .store()
      .execute(member.id, action, input, deps.now(), { provider: deps.provider(), subject });
  }
  return {
    prepare: async (subject: string) => {
      const member = await deps.activeUser(subject);
      return { memberId: member.id, ...(await deps.store().prepare(member.id, deps.now())) };
    },
    get: async (subject: string) => {
      const member = await deps.activeUser(subject);
      return deps.store().snapshot(member.id, deps.now());
    },
    clockIn: (subject: string, input: AttendanceInput) => run(subject, "clockIn", input),
    clockOut: (subject: string, input: AttendanceInput) => run(subject, "clockOut", input),
  };
}

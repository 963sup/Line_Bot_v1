import type { AttendanceDependencies } from "../contracts/clock.js";
import type { AttendanceInput } from "../contracts/input/attendance-command.js";
import type { AttendanceAction } from "../domain/value-objects/attendance-action.js";

export function createClockAttendance(deps: AttendanceDependencies) {
  async function execute(subject: string, action: AttendanceAction, input: AttendanceInput) {
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
    execute,
  };
}

import type { AttendanceDependencies } from "../contracts/clock.js";
import type { AttendanceInput } from "../contracts/input/attendance-command.js";
import type { AttendanceAction } from "../domain/value-objects/attendance-action.js";

export function createClockAttendance(deps: AttendanceDependencies) {
  async function execute(subject: string, action: AttendanceAction, input: AttendanceInput) {
    const user = await deps.activeUser(subject);
    return deps
      .store()
      .execute(user.id, action, input, deps.now(), { provider: deps.provider(), subject });
  }
  return {
    prepare: async (subject: string) => {
      const user = await deps.activeUser(subject);
      return { userId: user.id, ...(await deps.store().prepare(user.id, deps.now())) };
    },
    get: async (subject: string) => {
      const user = await deps.activeUser(subject);
      return deps.store().snapshot(user.id, deps.now());
    },
    execute,
  };
}

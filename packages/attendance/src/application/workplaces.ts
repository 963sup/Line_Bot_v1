import { AttendanceError, parseWorkplaceCommand } from "../domain.js";
import type { WorkplaceStore } from "./ports/workplaces.js";

export function createWorkplaces(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): WorkplaceStore;
  now(): number;
}) {
  return {
    async read(subject: string, id = "", after = "") {
      if (
        [id, after].some(
          (value) => value && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value),
        )
      ) {
        throw new AttendanceError(400, "地點查詢不正確。");
      }
      const user = await deps.activeUser(subject);
      return { userId: user.id, ...(await deps.store().read(user.id, id, after)) };
    },
    async change(subject: string, raw: unknown) {
      const command = parseWorkplaceCommand(raw);
      const user = await deps.activeUser(subject);
      return deps.store().change(user.id, command, deps.now());
    },
  };
}

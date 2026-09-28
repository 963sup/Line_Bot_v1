import type { WorkplaceStore } from "../contracts/workplaces.js";
import { AttendanceError, parseWorkplaceCommand } from "../domain.js";
export function createWorkplaces(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  store(): WorkplaceStore;
  now(): number;
}) {
  return {
    async read(subject: string, id = "", after = "") {
      if ([id, after].some((v) => v && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)))
        throw new AttendanceError(400, "地點查詢不正確。");
      const member = await deps.activeUser(subject);
      return { memberId: member.id, ...(await deps.store().read(member.id, id, after)) };
    },
    async change(subject: string, raw: unknown) {
      const command = parseWorkplaceCommand(raw);
      const member = await deps.activeUser(subject);
      return deps.store().change(member.id, command, deps.now());
    },
  };
}

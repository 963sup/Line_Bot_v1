import { readUserQualification } from "@line-work/account/adapters/postgres";
import { hasPermission } from "@line-work/identity-access/adapters/postgres";
import { businessDatabase, type Database } from "@line-work/platform/adapters/postgres";
import type { WorkplaceChatStore } from "../../application/ports/workplace-chat.js";
import {
  AttendanceError,
  type WorkplaceChatDraft,
  type WorkplaceChatResult,
} from "../../domain.js";
import { PostgresWorkplaceStore } from "./workplaces.js";

export class PostgresWorkplaceChatStore implements WorkplaceChatStore {
  constructor(private db: Database = businessDatabase()) {}
  transact(
    actor: string,
    eventId: string,
    work: Parameters<WorkplaceChatStore["transact"]>[2],
    now: number,
  ) {
    return this.db.transaction(async (sql) => {
      await sql.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('workplace-chat:' || $1, 0))",
        [actor],
      );
      await readUserQualification(sql, actor, "share");
      if (!(await hasPermission(sql, actor, "workplaces.manage"))) {
        throw new AttendanceError(403, "只有全部地點管理員能新增地點。");
      }
      const previous = (
        await sql.query("SELECT result FROM workplace_chat_events WHERE actor=$1 AND event_id=$2", [
          actor,
          eventId,
        ])
      ).rows[0];
      if (previous) return previous.result as WorkplaceChatResult;
      const current = (
        await sql.query("SELECT draft FROM workplace_chat_drafts WHERE actor=$1", [actor])
      ).rows[0]?.draft as WorkplaceChatDraft | undefined;
      const { command, ...result } = work(current ?? null);
      if (command) {
        await new PostgresWorkplaceStore({ transaction: (run) => run(sql) }).change(
          actor,
          command,
          now,
        );
      }
      if (result.draft) {
        await sql.query(
          "INSERT INTO workplace_chat_drafts(actor,draft) VALUES($1,$2) ON CONFLICT(actor) DO UPDATE SET draft=$2",
          [actor, JSON.stringify(result.draft)],
        );
      }
      await sql.query(
        "INSERT INTO workplace_chat_events(actor,event_id,result,at) VALUES($1,$2,$3,$4)",
        [actor, eventId, JSON.stringify(result), now],
      );
      return result;
    });
  }
}

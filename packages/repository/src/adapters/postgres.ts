import { createHash, randomUUID } from "node:crypto";
import { readAccountLogin, resolveAccountLogin } from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type {
  IssueCommand,
  IssueIdentity,
  IssueSnapshot,
  IssueStore,
  RepositorySelector,
} from "../application/ports/issues.js";
import {
  type Issue,
  IssueError,
  type RepositoryCapability,
  type RepositorySummary,
  transitionIssue,
} from "../domain.js";

type IssueRow = {
  id: string;
  repository_id: string;
  number: number | string;
  publisher: string;
  assignee: string;
  title: string;
  criteria: string;
  status: Issue["status"];
  version: number;
  created_at: number | string;
  updated_at: number | string;
};

function issue(row: IssueRow): Issue {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    number: Number(row.number),
    publisher: row.publisher,
    assignee: row.assignee,
    title: row.title,
    criteria: row.criteria,
    status: row.status,
    version: row.version,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function repositories(sql: Sql, userId: string): Promise<RepositorySummary[]> {
  const rows = (
    await sql.query(
      `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,a.capability
       FROM repositories r
       JOIN repository_effective_access a ON a.repository_id=r.id
       WHERE a.user_id=$1
       ORDER BY lower(r.name),r.id`,
      [userId],
    )
  ).rows as Array<{
    id: string;
    owner_account_id: string;
    owner_account_kind: "USER" | "ORGANIZATION";
    name: string;
    capability: RepositoryCapability;
  }>;
  const result: RepositorySummary[] = [];
  for (const row of rows) {
    const owner = await readAccountLogin(sql, row.owner_account_id, row.owner_account_kind);
    if (owner) {
      result.push({
        id: row.id,
        ownerLogin: owner.login,
        name: row.name,
        capability: row.capability,
      });
    }
  }
  return result;
}

async function scope(sql: Sql, identity: IssueIdentity, repositoryId: string) {
  const row = (
    await sql.query(
      `SELECT r.id,r.owner_account_id,r.owner_account_kind,r.name,a.capability
       FROM repositories r
       JOIN repository_effective_access a ON a.repository_id=r.id
       WHERE r.id=$1 AND a.user_id=$2`,
      [repositoryId, identity.userId],
    )
  ).rows[0] as
    | {
        id: string;
        owner_account_id: string;
        owner_account_kind: "USER" | "ORGANIZATION";
        name: string;
        capability: RepositoryCapability;
      }
    | undefined;
  if (!row) throw new IssueError(403, "沒有此 Repository 的存取權限。");
  const owner = await readAccountLogin(sql, row.owner_account_id, row.owner_account_kind);
  if (!owner) throw new IssueError(409, "Repository owner locator 不可用。");
  const access: RepositorySummary = {
    id: row.id,
    ownerLogin: owner.login,
    name: row.name,
    capability: row.capability,
  };
  const participants = (
    await sql.query(
      `SELECT user_id
       FROM repository_effective_access
       WHERE repository_id=$1
       ORDER BY user_id`,
      [repositoryId],
    )
  ).rows as Array<{ user_id: string }>;
  return {
    repository: access,
    participants: participants.map((row) => ({
      userId: row.user_id,
      name: row.user_id,
    })),
  };
}

async function resolveRepositoryId(
  sql: Sql,
  identity: IssueIdentity,
  selector: RepositorySelector,
): Promise<string> {
  if ("repositoryId" in selector) return selector.repositoryId;
  const owner = await resolveAccountLogin(sql, selector.ownerLogin);
  if (!owner) throw new IssueError(404, "找不到可存取的 Repository。");
  const row = (
    await sql.query(
      `SELECT r.id
       FROM repositories r
       JOIN repository_effective_access a ON a.repository_id=r.id
       WHERE r.owner_account_id=$1
         AND r.owner_account_kind=$2
         AND lower(r.name)=lower($3)
         AND a.user_id=$4`,
      [owner.id, owner.kind, selector.repositoryName, identity.userId],
    )
  ).rows[0] as { id: string } | undefined;
  if (!row) throw new IssueError(404, "找不到可存取的 Repository。");
  return row.id;
}

const writable = (capability: RepositoryCapability) =>
  capability === "write" || capability === "admin";

export class PostgresIssueStore implements IssueStore {
  constructor(private db: Database = businessDatabase()) {}

  snapshot(
    who: IssueIdentity,
    selector?: RepositorySelector,
    list = false,
    view?: "mine" | "created",
    page?: { after?: { at: number; id: string }; status?: string },
  ): Promise<IssueSnapshot> {
    return this.db.transaction(async (sql) => {
      const available = await repositories(sql, who.userId);
      const selectedId = selector
        ? await resolveRepositoryId(sql, who, selector)
        : available[0]?.id;
      if (!selectedId) {
        return { userId: who.userId, repositories: [], participants: [], issues: [], events: [] };
      }
      const selected = await scope(sql, who, selectedId);
      const rows = (
        await sql.query(
          `SELECT * FROM issues
           WHERE repository_id=$1
             AND ($2::text IS NULL OR assignee=$2)
             AND ($3::text IS NULL OR publisher=$3)
             AND ($4::text IS NULL OR status=$4)
             AND ($5::bigint IS NULL OR created_at<$5 OR (created_at=$5 AND id>$6))
           ORDER BY created_at DESC,id
           LIMIT $7`,
          [
            selectedId,
            list && view === "mine" ? who.userId : null,
            list && view === "created" ? who.userId : null,
            list ? (page?.status ?? null) : null,
            list ? (page?.after?.at ?? null) : null,
            list ? (page?.after?.id ?? null) : null,
            list ? 21 : 100,
          ],
        )
      ).rows as IssueRow[];
      const mapped = rows.map(issue);
      const hasMore = list && mapped.length > 20;
      if (hasMore) mapped.pop();
      const last = mapped.at(-1);
      const events = list
        ? []
        : (
            await sql.query(
              `SELECT e.* FROM issue_events e
               JOIN issues i ON i.id=e.issue_id
               WHERE i.repository_id=$1
               ORDER BY e.at,e.version`,
              [selectedId],
            )
          ).rows.map((row: Record<string, unknown>) => ({
            issueId: String(row.issue_id),
            actor: String(row.actor),
            action: String(row.action),
            note: String(row.note),
            version: Number(row.version),
            at: Number(row.at),
          }));
      return {
        userId: who.userId,
        repositories: available,
        participants: selected.participants,
        issues: mapped,
        events,
        ...(list
          ? { next: hasMore && last ? JSON.stringify({ at: last.createdAt, id: last.id }) : null }
          : {}),
      };
    });
  }

  detail(
    who: IssueIdentity,
    issueNumber: number,
    selector: RepositorySelector,
  ): Promise<IssueSnapshot> {
    return this.db.transaction(async (sql) => {
      const repositoryId = await resolveRepositoryId(sql, who, selector);
      const selected = await scope(sql, who, repositoryId);
      const available = await repositories(sql, who.userId);
      const row = (
        await sql.query("SELECT * FROM issues WHERE repository_id=$1 AND number=$2", [
          repositoryId,
          issueNumber,
        ])
      ).rows[0] as IssueRow | undefined;
      if (!row) throw new IssueError(404, "找不到 Issue。");
      const events = (
        await sql.query("SELECT * FROM issue_events WHERE issue_id=$1 ORDER BY at,version", [
          row.id,
        ])
      ).rows.map((event: Record<string, unknown>) => ({
        issueId: String(event.issue_id),
        actor: String(event.actor),
        action: String(event.action),
        note: String(event.note),
        version: Number(event.version),
        at: Number(event.at),
      }));
      return {
        userId: who.userId,
        repositories: available,
        participants: selected.participants,
        issues: [issue(row)],
        events,
      };
    });
  }

  execute(who: IssueIdentity, command: IssueCommand, now: number): Promise<Issue> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      const selected = await scope(sql, who, command.repositoryId);
      if (!writable(selected.repository.capability)) {
        throw new IssueError(403, "需要 Repository write 或 admin 權限。");
      }
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `issue:${who.userId}:${command.requestId}`,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM issue_commands WHERE actor=$1 AND request_id=$2",
          [who.userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      if (previous) {
        if (previous.fingerprint !== commandFingerprint) {
          throw new IssueError(409, "此請求編號已用於不同內容。");
        }
        const receipt = previous.result as { receiptVersion?: number; issue?: Issue };
        if (receipt.receiptVersion !== 1 || !receipt.issue) {
          throw new IssueError(503, "Issue 操作回執無法讀取。");
        }
        return receipt.issue;
      }

      let result: Issue;
      if (command.action === "create") {
        if (command.assignee === who.userId) {
          throw new IssueError(400, "建立者與承接人必須不同。");
        }
        if (!selected.participants.some((participant) => participant.userId === command.assignee)) {
          throw new IssueError(403, "承接人沒有此 Repository 的存取權限。");
        }
        const issueId = randomUUID();
        const numbered = (
          await sql.query(
            `UPDATE repositories
             SET next_issue_number=next_issue_number+1
             WHERE id=$1
             RETURNING next_issue_number-1 AS number`,
            [command.repositoryId],
          )
        ).rows[0] as { number: number | string } | undefined;
        if (!numbered) throw new IssueError(404, "找不到 Repository。");
        const number = Number(numbered.number);
        await sql.query(
          `INSERT INTO issues(
             id,repository_id,number,publisher,assignee,title,criteria,status,version,created_at,updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
          [
            issueId,
            command.repositoryId,
            number,
            who.userId,
            command.assignee,
            command.title,
            command.criteria,
            "pending",
            1,
            now,
          ],
        );
        result = {
          id: issueId,
          repositoryId: command.repositoryId,
          number,
          publisher: who.userId,
          assignee: command.assignee,
          title: command.title,
          criteria: command.criteria,
          status: "pending",
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        const row = (
          await sql.query("SELECT * FROM issues WHERE id=$1 AND repository_id=$2 FOR UPDATE", [
            command.issueId,
            command.repositoryId,
          ])
        ).rows[0] as IssueRow | undefined;
        if (!row) throw new IssueError(404, "找不到 Issue。");
        result = issue(row);
        if (result.version !== command.expectedVersion) {
          throw new IssueError(409, "Issue 已更新，請重新讀取後再操作。");
        }
        result = {
          ...result,
          status: transitionIssue(result, who.userId, command.action, command.note),
          version: result.version + 1,
          updatedAt: now,
        };
        await sql.query("UPDATE issues SET status=$2,version=$3,updated_at=$4 WHERE id=$1", [
          result.id,
          result.status,
          result.version,
          now,
        ]);
      }

      await sql.query(
        "INSERT INTO issue_events(issue_id,version,actor,action,note,at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          result.id,
          result.version,
          who.userId,
          command.action,
          command.action === "create" ? "" : command.note,
          now,
        ],
      );
      await sql.query(
        "INSERT INTO issue_commands(actor,request_id,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)",
        [
          who.userId,
          command.requestId,
          commandFingerprint,
          JSON.stringify({ receiptVersion: 1, issue: result }),
        ],
      );
      return result;
    });
  }
}

export { PostgresRepositoryStarStore } from "./postgres/stars.js";

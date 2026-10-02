import { createHash, randomUUID } from "node:crypto";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import {
  RepositoryError,
  type RepositoryPermission,
} from "@line_bot_v1/repository/domain";
import {
  accessibleRepositories,
  repositoryArchived,
  repositoryScope,
  resolveAuthorizedRepositoryId,
} from "@line_bot_v1/repository/postgres/access";
import { allocateRepositoryIssueNumber } from "@line_bot_v1/repository/postgres/issue-number";
import type {
  IssueCommand,
  IssueIdentity,
  IssueSnapshot,
  IssueStore,
} from "../application/ports/issues.js";
import {
  canIssueRepositoryOperation,
  type Issue,
  type IssueAction,
  IssueError,
  transitionIssue,
} from "../domain.js";

async function repositoryOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw new IssueError(error.status, error.message);
    }
    throw error;
  }
}

type IssueRow = {
  id: string;
  repository_id: string;
  number: number | string;
  publisher: string;
  title: string;
  body: string;
  criteria: string;
  state: Issue["state"];
  state_reason: Issue["stateReason"];
  workflow_status: Issue["workflowStatus"];
  version: number;
  created_at: number | string;
  updated_at: number | string;
};

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

type WorkflowIssueCommand = Extract<IssueCommand, { action: IssueAction }>;

function isWorkflowCommand(command: IssueCommand): command is WorkflowIssueCommand {
  return (
    command.action === "accept" ||
    command.action === "report" ||
    command.action === "reject" ||
    command.action === "approve"
  );
}

function issue(row: IssueRow, assignees: readonly string[]): Issue {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    number: Number(row.number),
    publisher: row.publisher,
    assignees,
    title: row.title,
    body: row.body,
    criteria: row.criteria,
    state: row.state,
    stateReason: row.state_reason,
    workflowStatus: row.workflow_status,
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function assigneesByIssue(
  sql: Sql,
  issueIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!issueIds.length) return result;
  const rows = (
    await sql.query(
      `SELECT issue_id,user_id
       FROM issue_assignees
       WHERE issue_id=ANY($1::text[])
       ORDER BY issue_id,user_id`,
      [issueIds],
    )
  ).rows as Array<{ issue_id: string; user_id: string }>;
  for (const row of rows) {
    const values = result.get(row.issue_id) ?? [];
    values.push(row.user_id);
    result.set(row.issue_id, values);
  }
  return result;
}

async function hydratedIssues(sql: Sql, rows: IssueRow[]): Promise<Issue[]> {
  const assignees = await assigneesByIssue(
    sql,
    rows.map((row) => row.id),
  );
  return rows.map((row) => issue(row, assignees.get(row.id) ?? []));
}

function eventData(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function receiptIssue(value: unknown): Issue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  if (
    typeof row.id === "string" &&
    typeof row.repositoryId === "string" &&
    typeof row.number === "number" &&
    typeof row.publisher === "string" &&
    Array.isArray(row.assignees) &&
    row.assignees.every((assignee) => typeof assignee === "string") &&
    typeof row.title === "string" &&
    typeof row.body === "string" &&
    typeof row.criteria === "string" &&
    (row.state === "OPEN" || row.state === "CLOSED") &&
    (row.stateReason === null ||
      row.stateReason === "COMPLETED" ||
      row.stateReason === "DUPLICATE" ||
      row.stateReason === "NOT_PLANNED" ||
      row.stateReason === "REOPENED") &&
    (row.workflowStatus === "pending" ||
      row.workflowStatus === "active" ||
      row.workflowStatus === "review" ||
      row.workflowStatus === "completed") &&
    typeof row.version === "number" &&
    typeof row.createdAt === "number" &&
    typeof row.updatedAt === "number"
  ) {
    return row as unknown as Issue;
  }

  const legacyStatus = row.status;
  if (
    typeof row.id !== "string" ||
    typeof row.repositoryId !== "string" ||
    typeof row.number !== "number" ||
    typeof row.publisher !== "string" ||
    typeof row.assignee !== "string" ||
    typeof row.title !== "string" ||
    typeof row.criteria !== "string" ||
    (legacyStatus !== "pending" &&
      legacyStatus !== "active" &&
      legacyStatus !== "review" &&
      legacyStatus !== "completed") ||
    typeof row.version !== "number" ||
    typeof row.createdAt !== "number" ||
    typeof row.updatedAt !== "number"
  ) {
    return null;
  }

  return {
    id: row.id,
    repositoryId: row.repositoryId,
    number: row.number,
    publisher: row.publisher,
    assignees: [row.assignee],
    title: row.title,
    body: row.criteria,
    criteria: row.criteria,
    state: legacyStatus === "completed" ? "CLOSED" : "OPEN",
    stateReason: legacyStatus === "completed" ? "COMPLETED" : null,
    workflowStatus: legacyStatus,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function acceptedFingerprints(command: IssueCommand): Set<string> {
  const values = new Set([fingerprint(command)]);
  if (
    command.action === "create" &&
    command.body === "" &&
    command.assigneeIds.length === 1
  ) {
    values.add(
      fingerprint({
        requestId: command.requestId,
        repositoryId: command.repositoryId,
        action: "create",
        title: command.title,
        criteria: command.criteria,
        assignee: command.assigneeIds[0],
      }),
    );
  }
  if (isWorkflowCommand(command)) {
    values.add(
      fingerprint({
        requestId: command.requestId,
        repositoryId: command.repositoryId,
        action: command.action,
        issueId: command.issueId,
        expectedVersion: command.expectedVersion,
        note: command.note,
      }),
    );
  }
  return values;
}

function readReceipt(
  previous: { fingerprint: string; result: unknown } | undefined,
  command: IssueCommand,
): Issue | null {
  if (!previous) return null;
  if (!acceptedFingerprints(command).has(previous.fingerprint)) {
    throw new IssueError(409, "此請求編號已用於不同內容。");
  }
  const receipt = previous.result as { receiptVersion?: number; issue?: unknown };
  const restored = receiptIssue(receipt.issue);
  if (receipt.receiptVersion !== 1 || !restored) {
    throw new IssueError(503, "Issue 操作回執無法讀取。");
  }
  return restored;
}

function requireCommandPermission(
  permissions: readonly RepositoryPermission[],
  command: IssueCommand,
) {
  if (command.action === "create") {
    if (!canIssueRepositoryOperation(permissions, "open")) {
      throw new IssueError(403, "目前的 Repository access 不允許建立 Issue。");
    }
    return;
  }

  const permitted = isWorkflowCommand(command)
    ? canIssueRepositoryOperation(permissions, "workflow")
    : command.action === "edit"
      ? canIssueRepositoryOperation(permissions, "edit")
      : command.action === "close" || command.action === "reopen"
        ? canIssueRepositoryOperation(permissions, "close")
        : canIssueRepositoryOperation(permissions, "assign");
  if (!permitted) {
    throw new IssueError(403, "目前的 Repository access 不允許此 Issue 操作。");
  }
}

function assertAssignableUsers(
  participantIds: ReadonlySet<string>,
  assigneeIds: readonly string[],
) {
  for (const userId of assigneeIds) {
    if (!participantIds.has(userId)) {
      throw new IssueError(403, "Assignee 必須有此 Repository 的 current collaborator access。");
    }
  }
}

export class PostgresIssueStore implements IssueStore {
  constructor(private db: Database = businessDatabase()) {}

  snapshot(
    who: IssueIdentity,
    selector?: RepositorySelector,
    list = false,
    view?: "mine" | "created",
    page?: { after?: { at: number; id: string }; workflowStatus?: Issue["workflowStatus"] },
  ): Promise<IssueSnapshot> {
    return this.db.transaction(async (sql) => {
      const available = await repositoryOperation(() => accessibleRepositories(sql, who.userId));
      const selectedId = selector
        ? await repositoryOperation(() => resolveAuthorizedRepositoryId(sql, who, selector))
        : available[0]?.id;
      if (!selectedId) {
        return { userId: who.userId, repositories: [], participants: [], issues: [], events: [] };
      }
      const selected = await repositoryOperation(() => repositoryScope(sql, who, selectedId));
      const rows = (
        await sql.query(
          `SELECT i.*
           FROM issues i
           WHERE i.repository_id=$1
             AND (
               $2::text IS NULL
               OR EXISTS (
                 SELECT 1 FROM issue_assignees a
                 WHERE a.issue_id=i.id AND a.user_id=$2
               )
             )
             AND ($3::text IS NULL OR i.publisher=$3)
             AND ($4::text IS NULL OR i.workflow_status=$4)
             AND ($5::bigint IS NULL OR i.created_at<$5 OR (i.created_at=$5 AND i.id>$6))
           ORDER BY i.created_at DESC,i.id
           LIMIT $7`,
          [
            selectedId,
            list && view === "mine" ? who.userId : null,
            list && view === "created" ? who.userId : null,
            list ? (page?.workflowStatus ?? null) : null,
            list ? (page?.after?.at ?? null) : null,
            list ? (page?.after?.id ?? null) : null,
            list ? 21 : 100,
          ],
        )
      ).rows as IssueRow[];
      const mapped = await hydratedIssues(sql, rows);
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
            data: eventData(row.data),
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
      const repositoryId = await repositoryOperation(() =>
        resolveAuthorizedRepositoryId(sql, who, selector),
      );
      const selected = await repositoryOperation(() => repositoryScope(sql, who, repositoryId));
      const available = await repositoryOperation(() => accessibleRepositories(sql, who.userId));
      const row = (
        await sql.query("SELECT * FROM issues WHERE repository_id=$1 AND number=$2", [
          repositoryId,
          issueNumber,
        ])
      ).rows[0] as IssueRow | undefined;
      if (!row) throw new IssueError(404, "找不到 Issue。");
      const mapped = await hydratedIssues(sql, [row]);
      const events = (
        await sql.query("SELECT * FROM issue_events WHERE issue_id=$1 ORDER BY at,version", [
          row.id,
        ])
      ).rows.map((event: Record<string, unknown>) => ({
        issueId: String(event.issue_id),
        actor: String(event.actor),
        action: String(event.action),
        note: String(event.note),
        data: eventData(event.data),
        version: Number(event.version),
        at: Number(event.at),
      }));
      return {
        userId: who.userId,
        repositories: available,
        participants: selected.participants,
        issues: mapped,
        events,
      };
    });
  }

  execute(who: IssueIdentity, command: IssueCommand, now: number): Promise<Issue> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      const selected = await repositoryOperation(() =>
        repositoryScope(sql, who, command.repositoryId),
      );
      requireCommandPermission(selected.repository.permissions, command);

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "issue:" + who.userId + ":" + command.requestId,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM issue_commands WHERE actor=$1 AND request_id=$2",
          [who.userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      const replay = readReceipt(previous, command);
      if (replay) return replay;

      if (await repositoryOperation(() => repositoryArchived(sql, command.repositoryId))) {
        throw new IssueError(409, "Repository 已封存，Issue 目前為唯讀。");
      }

      if (
        command.action === "create" &&
        command.assigneeIds.length &&
        !canIssueRepositoryOperation(selected.repository.permissions, "assign")
      ) {
        throw new IssueError(403, "目前的 Repository access 不允許指派 Issue。");
      }

      const participantIds = new Set(selected.participants.map((participant) => participant.userId));
      let result: Issue;
      let eventNote = "";
      let data: Readonly<Record<string, unknown>>;

      if (command.action === "create") {
        assertAssignableUsers(participantIds, command.assigneeIds);
        const issueId = randomUUID();
        const number = await repositoryOperation(() =>
          allocateRepositoryIssueNumber(sql, command.repositoryId),
        );
        await sql.query(
          `INSERT INTO issues(
             id,repository_id,number,publisher,title,body,criteria,
             state,state_reason,workflow_status,version,created_at,updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,'OPEN',NULL,'pending',1,$8,$8)`,
          [
            issueId,
            command.repositoryId,
            number,
            who.userId,
            command.title,
            command.body,
            command.criteria,
            now,
          ],
        );
        if (command.assigneeIds.length) {
          await sql.query(
            `INSERT INTO issue_assignees(issue_id,user_id,assigned_at)
             SELECT $1,user_id,$3
             FROM unnest($2::text[]) AS user_id`,
            [issueId, command.assigneeIds, now],
          );
        }
        result = {
          id: issueId,
          repositoryId: command.repositoryId,
          number,
          publisher: who.userId,
          assignees: command.assigneeIds,
          title: command.title,
          body: command.body,
          criteria: command.criteria,
          state: "OPEN",
          stateReason: null,
          workflowStatus: "pending",
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        data = {
          state: result.state,
          stateReason: result.stateReason,
          workflowStatus: result.workflowStatus,
          assigneeIds: result.assignees,
        };
      } else {
        const row = (
          await sql.query("SELECT * FROM issues WHERE id=$1 AND repository_id=$2 FOR UPDATE", [
            command.issueId,
            command.repositoryId,
          ])
        ).rows[0] as IssueRow | undefined;
        if (!row) throw new IssueError(404, "找不到 Issue。");

        const assigneeMap = await assigneesByIssue(sql, [row.id]);
        result = issue(row, assigneeMap.get(row.id) ?? []);
        if (result.version !== command.expectedVersion) {
          throw new IssueError(409, "Issue 已更新，請重新讀取後再操作。");
        }

        if (isWorkflowCommand(command)) {
          const previousWorkflowStatus = result.workflowStatus;
          const workflowStatus = transitionIssue(result, who.userId, command.action, command.note);
          result = { ...result, workflowStatus };
          eventNote = command.note;
          data = {
            from: previousWorkflowStatus,
            to: workflowStatus,
          };
        } else if (command.action === "edit") {
          const changes: Record<string, unknown> = {};
          const title = command.title ?? result.title;
          const body = command.body ?? result.body;
          const criteria = command.criteria ?? result.criteria;
          if (title !== result.title) changes.title = { from: result.title, to: title };
          if (body !== result.body) changes.body = { from: result.body, to: body };
          if (criteria !== result.criteria) {
            changes.criteria = { from: result.criteria, to: criteria };
          }
          if (!Object.keys(changes).length) {
            throw new IssueError(409, "Issue 內容沒有變更。");
          }
          result = { ...result, title, body, criteria };
          data = { changes };
        } else if (command.action === "close") {
          if (result.state === "CLOSED") {
            throw new IssueError(409, "Issue 已關閉。");
          }
          data = {
            from: { state: result.state, stateReason: result.stateReason },
            to: { state: "CLOSED", stateReason: command.stateReason },
          };
          result = {
            ...result,
            state: "CLOSED",
            stateReason: command.stateReason,
          };
          eventNote = command.note;
        } else if (command.action === "reopen") {
          if (result.state === "OPEN") {
            throw new IssueError(409, "Issue 已是 OPEN。");
          }
          data = {
            from: { state: result.state, stateReason: result.stateReason },
            to: { state: "OPEN", stateReason: "REOPENED" },
          };
          result = {
            ...result,
            state: "OPEN",
            stateReason: "REOPENED",
          };
          eventNote = command.note;
        } else if (command.action === "add-assignees") {
          assertAssignableUsers(participantIds, command.assigneeIds);
          const current = new Set(result.assignees);
          const added = command.assigneeIds.filter((userId) => !current.has(userId));
          if (!added.length) throw new IssueError(409, "Issue assignees 沒有變更。");
          await sql.query(
            `INSERT INTO issue_assignees(issue_id,user_id,assigned_at)
             SELECT $1,user_id,$3
             FROM unnest($2::text[]) AS user_id
             ON CONFLICT DO NOTHING`,
            [result.id, added, now],
          );
          result = {
            ...result,
            assignees: [...result.assignees, ...added].sort((left, right) =>
              left.localeCompare(right),
            ),
          };
          data = { addedAssigneeIds: added };
        } else if (command.action === "remove-assignees") {
          const current = new Set(result.assignees);
          const removed = command.assigneeIds.filter((userId) => current.has(userId));
          if (!removed.length) throw new IssueError(409, "Issue assignees 沒有變更。");
          await sql.query(
            "DELETE FROM issue_assignees WHERE issue_id=$1 AND user_id=ANY($2::text[])",
            [result.id, removed],
          );
          const removedSet = new Set(removed);
          result = {
            ...result,
            assignees: result.assignees.filter((userId) => !removedSet.has(userId)),
          };
          data = { removedAssigneeIds: removed };
        } else {
          command satisfies never;
          throw new IssueError(400, "Issue 操作不正確。");
        }

        const nextVersion = result.version + 1;
        const changed = (
          await sql.query(
            `UPDATE issues
             SET title=$2,
                 body=$3,
                 criteria=$4,
                 state=$5,
                 state_reason=$6,
                 workflow_status=$7,
                 version=$8,
                 updated_at=$9
             WHERE id=$1 AND version=$10
             RETURNING version`,
            [
              result.id,
              result.title,
              result.body,
              result.criteria,
              result.state,
              result.stateReason,
              result.workflowStatus,
              nextVersion,
              now,
              result.version,
            ],
          )
        ).rows[0] as { version: number } | undefined;
        if (!changed) throw new IssueError(409, "Issue 已更新，請重新讀取後再操作。");
        result = {
          ...result,
          version: Number(changed.version),
          updatedAt: now,
        };
      }

      await sql.query(
        `INSERT INTO issue_events(issue_id,version,actor,action,note,data,at)
         VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [
          result.id,
          result.version,
          who.userId,
          command.action,
          eventNote,
          JSON.stringify(data),
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

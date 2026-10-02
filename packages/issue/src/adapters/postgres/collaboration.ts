import { randomUUID } from "node:crypto";
import { readOrganizationQualification } from "@line_bot_v1/organization/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { repositoryOwnerIdentity } from "@line_bot_v1/repository/postgres/access";
import {
  repositoryLabelIdsExist,
  repositoryMilestoneExists,
} from "@line_bot_v1/repository/postgres/resource-management";
import type {
  IssueCollaborationCommand,
  IssueCollaborationIdentity,
  IssueCollaborationReceipt,
  IssueCollaborationStore,
  IssueCollaborationView,
  IssueLockReason,
} from "../../contracts/collaboration.js";
import type { IssueTypeDefinition } from "../../contracts/issue-types.js";
import { IssueError } from "../../domain.js";
import {
  advance,
  type CommentRow,
  comment,
  currentIssue,
  dependencyWouldCycle,
  duplicateRelation,
  fingerprint,
  hierarchyWouldCycle,
  type IssueHead,
  privilegedCommenter,
  readReceipt,
  requireActionPermission,
  requireExpectedVersion,
  requireWritableRepository,
  sourceScope,
  storedReceipt,
  targetIssue,
  visibleRelatedIds,
} from "./collaboration-helpers.js";

type AssignedIssueTypeRow = {
  id: string;
  organization_account_id: string;
  name: string;
  description: string | null;
  color: IssueTypeDefinition["color"];
  is_enabled: boolean;
  deleted_at: number | string | null;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

function issueTypeDefinition(row: AssignedIssueTypeRow): IssueTypeDefinition {
  return {
    id: row.id,
    organizationAccountId: row.organization_account_id,
    name: row.name,
    description: row.description,
    color: row.color,
    isEnabled: row.is_enabled,
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function assignedIssueType(sql: Sql, issueId: string): Promise<IssueTypeDefinition | null> {
  const row = (
    await sql.query(
      `SELECT
         t.id,t.organization_account_id,t.name,t.description,t.color,t.is_enabled,
         t.deleted_at,t.version,t.created_at,t.updated_at
       FROM issue_type_assignments a
       JOIN issue_types t ON t.id=a.issue_type_id
       WHERE a.issue_id=$1`,
      [issueId],
    )
  ).rows[0] as AssignedIssueTypeRow | undefined;
  if (!row) return null;
  if (row.deleted_at !== null) {
    throw new IssueError(503, "IssueType assignment 指向已刪除的 type。");
  }
  return issueTypeDefinition(row);
}

export class PostgresIssueCollaborationStore implements IssueCollaborationStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  view(
    who: IssueCollaborationIdentity,
    repositoryId: string,
    issueId: string,
  ): Promise<IssueCollaborationView> {
    return this.db.transaction(async (sql) => {
      await sourceScope(sql, who, repositoryId);
      const issue = (
        await sql.query(
          `SELECT id,repository_id,version,milestone_id,is_locked,lock_reason
           FROM issues WHERE repository_id=$1 AND id=$2`,
          [repositoryId, issueId],
        )
      ).rows[0] as
        | {
            id: string;
            repository_id: string;
            version: number | string;
            milestone_id: string | null;
            is_locked: boolean;
            lock_reason: IssueLockReason | null;
          }
        | undefined;
      if (!issue) throw new IssueError(404, "找不到 Issue。");

      const [
        issueType,
        commentRows,
        labelRows,
        parentRows,
        subIssueIds,
        blockedByIssueIds,
        blockingIssueIds,
        relatedIssueIds,
      ] = await Promise.all([
        assignedIssueType(sql, issueId),
        sql.query(
          `SELECT id,issue_id,author,body,deleted_at,version,created_at,updated_at
           FROM issue_comments WHERE issue_id=$1 ORDER BY created_at,id`,
          [issueId],
        ),
        sql.query("SELECT label_id FROM issue_labels WHERE issue_id=$1 ORDER BY label_id", [
          issueId,
        ]),
        sql.query(
          `SELECT p.parent_issue_id AS id
           FROM issue_sub_issues p
           JOIN issues target ON target.id=p.parent_issue_id
           WHERE p.child_issue_id=$1
             AND EXISTS (
               SELECT 1 FROM repository_visibility_access v
               WHERE v.repository_id=target.repository_id AND (v.user_id=$2 OR v.user_id IS NULL)
             )`,
          [issueId, who.userId],
        ),
        visibleRelatedIds(
          sql,
          who.userId,
          `SELECT s.child_issue_id AS id
           FROM issue_sub_issues s
           JOIN issues target ON target.id=s.child_issue_id
           WHERE s.parent_issue_id=$1
             AND EXISTS (
               SELECT 1 FROM repository_visibility_access v
               WHERE v.repository_id=target.repository_id AND (v.user_id=$2 OR v.user_id IS NULL)
             )
           ORDER BY s.position,s.child_issue_id`,
          issueId,
        ),
        visibleRelatedIds(
          sql,
          who.userId,
          `SELECT d.blocking_issue_id AS id
           FROM issue_dependencies d
           JOIN issues target ON target.id=d.blocking_issue_id
           WHERE d.blocked_issue_id=$1
             AND EXISTS (
               SELECT 1 FROM repository_visibility_access v
               WHERE v.repository_id=target.repository_id AND (v.user_id=$2 OR v.user_id IS NULL)
             )
           ORDER BY d.blocking_issue_id`,
          issueId,
        ),
        visibleRelatedIds(
          sql,
          who.userId,
          `SELECT d.blocked_issue_id AS id
           FROM issue_dependencies d
           JOIN issues target ON target.id=d.blocked_issue_id
           WHERE d.blocking_issue_id=$1
             AND EXISTS (
               SELECT 1 FROM repository_visibility_access v
               WHERE v.repository_id=target.repository_id AND (v.user_id=$2 OR v.user_id IS NULL)
             )
           ORDER BY d.blocked_issue_id`,
          issueId,
        ),
        visibleRelatedIds(
          sql,
          who.userId,
          `SELECT CASE WHEN r.left_issue_id=$1 THEN r.right_issue_id ELSE r.left_issue_id END AS id
           FROM issue_related r
           JOIN issues target
             ON target.id=CASE WHEN r.left_issue_id=$1 THEN r.right_issue_id ELSE r.left_issue_id END
           WHERE (r.left_issue_id=$1 OR r.right_issue_id=$1)
             AND EXISTS (
               SELECT 1 FROM repository_visibility_access v
               WHERE v.repository_id=target.repository_id AND (v.user_id=$2 OR v.user_id IS NULL)
             )
           ORDER BY id`,
          issueId,
        ),
      ]);

      return {
        issueId: issue.id,
        repositoryId: issue.repository_id,
        version: Number(issue.version),
        locked: issue.is_locked,
        lockReason: issue.lock_reason,
        milestoneId: issue.milestone_id,
        issueType,
        labelIds: (labelRows.rows as Array<{ label_id: string }>).map((row) => row.label_id),
        comments: (commentRows.rows as CommentRow[]).map(comment),
        parentIssueId: (parentRows.rows[0] as { id: string } | undefined)?.id ?? null,
        subIssueIds,
        blockedByIssueIds,
        blockingIssueIds,
        relatedIssueIds,
      };
    });
  }

  execute(
    who: IssueCollaborationIdentity,
    command: IssueCollaborationCommand,
    now: number,
  ): Promise<IssueCollaborationReceipt> {
    const commandFingerprint = fingerprint(command);
    return this.db.transaction(async (sql) => {
      const selected = await sourceScope(sql, who, command.repositoryId);
      requireActionPermission(selected.repository.permissions, command.action);

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `issue:${who.userId}:${command.requestId}`,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM issue_commands WHERE actor=$1 AND request_id=$2",
          [who.userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      const replay = readReceipt(previous, commandFingerprint);
      if (replay) return replay;

      await requireWritableRepository(sql, command.repositoryId);
      if (command.action === "add-related" || command.action === "remove-related") {
        await sql.query("SELECT pg_advisory_xact_lock(hashtext('issue-related-graph'))");
      }
      const issue = await currentIssue(sql, command.repositoryId, command.issueId);
      requireExpectedVersion(issue, command.expectedVersion);

      let data: Record<string, unknown> = {};
      let resourceId: string | null = null;
      let relatedPeer: IssueHead | null = null;
      let relatedPeerExpectedVersion: number | null = null;
      let relatedPeerAction: "add-related" | "remove-related" | null = null;
      let patch:
        | { milestoneId?: string | null; locked?: boolean; lockReason?: IssueLockReason | null }
        | undefined;

      if (command.action === "add-comment") {
        if (issue.is_locked && !privilegedCommenter(selected.repository.permissions)) {
          throw new IssueError(409, "Conversation 已鎖定，目前權限不能新增留言。");
        }
        resourceId = randomUUID();
        await sql.query(
          `INSERT INTO issue_comments(
             id,issue_id,author,body,deleted_at,version,created_at,updated_at
           ) VALUES($1,$2,$3,$4,NULL,1,$5,$5)`,
          [resourceId, issue.id, who.userId, command.body, now],
        );
        data = { commentId: resourceId };
      } else if (command.action === "edit-comment" || command.action === "delete-comment") {
        const row = (
          await sql.query(
            `SELECT id,issue_id,author,body,deleted_at,version,created_at,updated_at
             FROM issue_comments WHERE issue_id=$1 AND id=$2 FOR UPDATE`,
            [issue.id, command.commentId],
          )
        ).rows[0] as CommentRow | undefined;
        if (!row) throw new IssueError(404, "找不到 Issue 留言。");
        if (Number(row.version) !== command.commentVersion) {
          throw new IssueError(409, "Issue 留言已更新，請重新讀取後再操作。");
        }
        if (row.deleted_at !== null) throw new IssueError(409, "Issue 留言已刪除。");
        const canModerate = privilegedCommenter(selected.repository.permissions);
        if (row.author !== who.userId && !canModerate) {
          throw new IssueError(403, "只能編輯自己的留言，或使用具管理能力的 Repository access。");
        }
        if (issue.is_locked && !canModerate) {
          throw new IssueError(409, "Conversation 已鎖定，目前權限不能編輯留言。");
        }
        resourceId = row.id;
        if (command.action === "edit-comment") {
          const updated = (
            await sql.query(
              `UPDATE issue_comments
               SET body=$3,version=version+1,updated_at=$4
               WHERE issue_id=$1 AND id=$2 AND version=$5 AND deleted_at IS NULL
               RETURNING version`,
              [issue.id, row.id, command.body, now, command.commentVersion],
            )
          ).rows[0] as { version: number | string } | undefined;
          if (!updated) throw new IssueError(409, "Issue 留言已更新，請重新讀取後再操作。");
          data = { commentId: row.id, commentVersion: Number(updated.version) };
        } else {
          const deleted = (
            await sql.query(
              `UPDATE issue_comments
               SET body='',deleted_at=$3,version=version+1,updated_at=$3
               WHERE issue_id=$1 AND id=$2 AND version=$4 AND deleted_at IS NULL
               RETURNING version`,
              [issue.id, row.id, now, command.commentVersion],
            )
          ).rows[0] as { version: number | string } | undefined;
          if (!deleted) throw new IssueError(409, "Issue 留言已更新，請重新讀取後再操作。");
          data = { commentId: row.id, commentVersion: Number(deleted.version), deleted: true };
        }
      } else if (command.action === "add-labels") {
        if (!(await repositoryLabelIdsExist(sql, issue.repository_id, command.labelIds))) {
          throw new IssueError(409, "Label 必須存在於同一 Repository。");
        }
        const added = (
          await sql.query(
            `INSERT INTO issue_labels(repository_id,issue_id,label_id,added_by,created_at)
             SELECT $1,$2,label_id,$4,$5 FROM unnest($3::text[]) AS label_id
             ON CONFLICT DO NOTHING
             RETURNING label_id`,
            [issue.repository_id, issue.id, command.labelIds, who.userId, now],
          )
        ).rows as Array<{ label_id: string }>;
        if (!added.length) throw new IssueError(409, "Issue labels 沒有變更。");
        data = { addedLabelIds: added.map((row) => row.label_id).sort() };
      } else if (command.action === "remove-labels") {
        const removed = (
          await sql.query(
            `DELETE FROM issue_labels
             WHERE issue_id=$1 AND label_id=ANY($2::text[])
             RETURNING label_id`,
            [issue.id, command.labelIds],
          )
        ).rows as Array<{ label_id: string }>;
        if (!removed.length) throw new IssueError(409, "Issue labels 沒有變更。");
        data = { removedLabelIds: removed.map((row) => row.label_id).sort() };
      } else if (command.action === "clear-labels") {
        const removed = (
          await sql.query("DELETE FROM issue_labels WHERE issue_id=$1 RETURNING label_id", [
            issue.id,
          ])
        ).rows as Array<{ label_id: string }>;
        if (!removed.length) throw new IssueError(409, "Issue labels 已是空集合。");
        data = { removedLabelIds: removed.map((row) => row.label_id).sort() };
      } else if (command.action === "set-milestone") {
        if (command.milestoneId !== null) {
          if (!(await repositoryMilestoneExists(sql, issue.repository_id, command.milestoneId))) {
            throw new IssueError(409, "Milestone 必須存在於同一 Repository。");
          }
        }
        if (issue.milestone_id === command.milestoneId) {
          throw new IssueError(409, "Issue milestone 沒有變更。");
        }
        patch = { milestoneId: command.milestoneId };
        data = { from: issue.milestone_id, to: command.milestoneId };
      } else if (
        command.action === "add-sub-issue" ||
        command.action === "remove-sub-issue" ||
        command.action === "reprioritize-sub-issue"
      ) {
        const target = await targetIssue(sql, who, issue.id, command.targetIssueId);
        await sql.query("SELECT pg_advisory_xact_lock(hashtext('issue-sub-issue-graph'))");
        resourceId = target.id;
        if (command.action === "add-sub-issue") {
          if (await hierarchyWouldCycle(sql, issue.id, target.id)) {
            throw new IssueError(409, "Sub-issue 關係會形成 cycle。");
          }
          const positionRow = (
            await sql.query(
              "SELECT COALESCE(MAX(position),-1)+1 AS position FROM issue_sub_issues WHERE parent_issue_id=$1",
              [issue.id],
            )
          ).rows[0] as { position: number | string };
          try {
            await sql.query(
              `INSERT INTO issue_sub_issues(
                 parent_issue_id,child_issue_id,position,created_by,created_at
               ) VALUES($1,$2,$3,$4,$5)`,
              [issue.id, target.id, Number(positionRow.position), who.userId, now],
            );
          } catch (error) {
            duplicateRelation(error);
          }
          data = { subIssueId: target.id, position: Number(positionRow.position) };
        } else if (command.action === "remove-sub-issue") {
          const removed = (
            await sql.query(
              `DELETE FROM issue_sub_issues
               WHERE parent_issue_id=$1 AND child_issue_id=$2
               RETURNING position`,
              [issue.id, target.id],
            )
          ).rows[0] as { position: number | string } | undefined;
          if (!removed) throw new IssueError(409, "此 Sub-issue 關係不存在。");
          data = { subIssueId: target.id, previousPosition: Number(removed.position) };
        } else {
          if (!("beforeIssueId" in command)) {
            throw new IssueError(400, "Sub-issue 排序命令不正確。");
          }
          if (command.beforeIssueId === target.id) {
            throw new IssueError(409, "Sub-issue 排序沒有變更。");
          }
          if (command.beforeIssueId !== null) {
            await targetIssue(sql, who, issue.id, command.beforeIssueId);
          }
          const rows = (
            await sql.query(
              `SELECT child_issue_id FROM issue_sub_issues
               WHERE parent_issue_id=$1 ORDER BY position,child_issue_id`,
              [issue.id],
            )
          ).rows as Array<{ child_issue_id: string }>;
          const ordered = rows.map((row) => row.child_issue_id);
          const currentIndex = ordered.indexOf(target.id);
          if (currentIndex < 0) throw new IssueError(409, "此 Sub-issue 關係不存在。");
          ordered.splice(currentIndex, 1);
          const beforeIndex =
            command.beforeIssueId === null
              ? ordered.length
              : ordered.indexOf(command.beforeIssueId);
          if (beforeIndex < 0) throw new IssueError(409, "排序目標不是同一 parent 的 Sub-issue。");
          ordered.splice(beforeIndex, 0, target.id);
          for (let index = 0; index < ordered.length; index += 1) {
            await sql.query(
              `UPDATE issue_sub_issues SET position=$3
               WHERE parent_issue_id=$1 AND child_issue_id=$2`,
              [issue.id, ordered[index], index],
            );
          }
          data = { subIssueId: target.id, position: ordered.indexOf(target.id) };
        }
      } else if (command.action === "add-blocked-by" || command.action === "remove-blocked-by") {
        const target = await targetIssue(sql, who, issue.id, command.targetIssueId);
        await sql.query("SELECT pg_advisory_xact_lock(hashtext('issue-dependency-graph'))");
        resourceId = target.id;
        if (command.action === "add-blocked-by") {
          if (await dependencyWouldCycle(sql, issue.id, target.id)) {
            throw new IssueError(409, "Issue blockedBy 關係會形成 cycle。");
          }
          try {
            await sql.query(
              `INSERT INTO issue_dependencies(
                 blocked_issue_id,blocking_issue_id,created_by,created_at
               ) VALUES($1,$2,$3,$4)`,
              [issue.id, target.id, who.userId, now],
            );
          } catch (error) {
            duplicateRelation(error);
          }
          data = { blockedByIssueId: target.id };
        } else {
          const removed = (
            await sql.query(
              `DELETE FROM issue_dependencies
               WHERE blocked_issue_id=$1 AND blocking_issue_id=$2
               RETURNING blocking_issue_id`,
              [issue.id, target.id],
            )
          ).rows[0];
          if (!removed) throw new IssueError(409, "此 blockedBy 關係不存在。");
          data = { removedBlockedByIssueId: target.id };
        }
      } else if (command.action === "add-related" || command.action === "remove-related") {
        const target = await targetIssue(sql, who, issue.id, command.targetIssueId);
        relatedPeer = await currentIssue(sql, target.repository_id, target.id);
        requireExpectedVersion(relatedPeer, command.targetExpectedVersion);
        relatedPeerExpectedVersion = command.targetExpectedVersion;
        relatedPeerAction = command.action;
        const ordered = [issue.id, target.id].sort((left, right) => left.localeCompare(right));
        const left = ordered[0]!;
        const right = ordered[1]!;
        resourceId = target.id;
        if (command.action === "add-related") {
          try {
            await sql.query(
              `INSERT INTO issue_related(left_issue_id,right_issue_id,created_by,created_at)
               VALUES($1,$2,$3,$4)`,
              [left, right, who.userId, now],
            );
          } catch (error) {
            duplicateRelation(error);
          }
          data = { relatedIssueId: target.id };
        } else {
          const removed = (
            await sql.query(
              `DELETE FROM issue_related
               WHERE left_issue_id=$1 AND right_issue_id=$2
               RETURNING left_issue_id`,
              [left, right],
            )
          ).rows[0];
          if (!removed) throw new IssueError(409, "此 relatesTo 關係不存在。");
          data = { removedRelatedIssueId: target.id };
        }
      } else if (command.action === "set-issue-type") {
        const before = await assignedIssueType(sql, issue.id);
        if (command.issueTypeId === null) {
          if (!before) throw new IssueError(409, "Issue 尚未指定 IssueType。");
          await sql.query("DELETE FROM issue_type_assignments WHERE issue_id=$1", [issue.id]);
          resourceId = before.id;
          data = {
            timelineEvent: "issue_type_removed",
            previousIssueType: before,
            issueType: null,
          };
        } else {
          if (before?.id === command.issueTypeId) {
            throw new IssueError(409, "IssueType 沒有變更。");
          }
          const owner = await repositoryOwnerIdentity(sql, who, issue.repository_id);
          if (owner.kind !== "ORGANIZATION") {
            throw new IssueError(409, "個人 Repository 不能指定 Organization IssueType。");
          }
          const organization = await readOrganizationQualification(sql, owner.id, "share");
          if (!organization || organization.status !== "active") {
            throw new IssueError(409, "Repository Organization 目前不可使用 IssueType。");
          }
          const row = (
            await sql.query(
              `SELECT
                 id,organization_account_id,name,description,color,is_enabled,
                 deleted_at,version,created_at,updated_at
               FROM issue_types
               WHERE id=$1 AND organization_account_id=$2`,
              [command.issueTypeId, owner.id],
            )
          ).rows[0] as AssignedIssueTypeRow | undefined;
          if (!row || row.deleted_at !== null) {
            throw new IssueError(409, "IssueType 不屬於此 Repository Organization scope。");
          }
          if (!row.is_enabled) {
            throw new IssueError(409, "disabled IssueType 不能建立新的 Issue 關係。");
          }
          try {
            await sql.query(
              `INSERT INTO issue_type_assignments(issue_id,issue_type_id,assigned_by,assigned_at)
               VALUES($1,$2,$3,$4)
               ON CONFLICT(issue_id) DO UPDATE
               SET issue_type_id=EXCLUDED.issue_type_id,
                   assigned_by=EXCLUDED.assigned_by,
                   assigned_at=EXCLUDED.assigned_at`,
              [issue.id, row.id, who.userId, now],
            );
          } catch (error) {
            if ((error as { code?: string }).code === "23514") {
              throw new IssueError(409, "IssueType 與 Repository Organization scope 不相容。");
            }
            throw error;
          }
          const after = issueTypeDefinition(row);
          resourceId = after.id;
          data = {
            timelineEvent: before ? "issue_type_changed" : "issue_type_added",
            previousIssueType: before,
            issueType: after,
          };
        }
      } else if (command.action === "lock") {
        if (issue.is_locked) throw new IssueError(409, "Conversation 已鎖定。");
        patch = { locked: true, lockReason: command.reason };
        data = { locked: true, reason: command.reason };
      } else {
        if (!issue.is_locked) throw new IssueError(409, "Conversation 未鎖定。");
        patch = { locked: false, lockReason: null };
        data = { locked: false, previousReason: issue.lock_reason };
      }

      const nextVersion = await advance(sql, issue, command.expectedVersion, now, patch);
      await sql.query(
        `INSERT INTO issue_events(issue_id,version,actor,action,note,data,at)
         VALUES($1,$2,$3,$4,'',$5::jsonb,$6)`,
        [issue.id, nextVersion, who.userId, command.action, JSON.stringify(data), now],
      );

      if (relatedPeer && relatedPeerExpectedVersion !== null && relatedPeerAction !== null) {
        const peerVersion = await advance(sql, relatedPeer, relatedPeerExpectedVersion, now);
        const peerData =
          relatedPeerAction === "add-related"
            ? { relatedIssueId: issue.id, mirrored: true }
            : { removedRelatedIssueId: issue.id, mirrored: true };
        await sql.query(
          `INSERT INTO issue_events(issue_id,version,actor,action,note,data,at)
           VALUES($1,$2,$3,$4,'',$5::jsonb,$6)`,
          [
            relatedPeer.id,
            peerVersion,
            who.userId,
            relatedPeerAction,
            JSON.stringify(peerData),
            now,
          ],
        );
      }

      const result: IssueCollaborationReceipt = {
        requestId: command.requestId,
        repositoryId: command.repositoryId,
        issueId: command.issueId,
        action: command.action,
        version: nextVersion,
        at: now,
        resourceId,
        data,
      };
      await sql.query(
        `INSERT INTO issue_commands(actor,request_id,fingerprint,result)
         VALUES($1,$2,$3,$4::jsonb)`,
        [who.userId, command.requestId, commandFingerprint, JSON.stringify(storedReceipt(result))],
      );
      return result;
    });
  }
}

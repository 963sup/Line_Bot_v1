import { randomUUID } from "node:crypto";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import type { RepositoryPermission } from "@line_bot_v1/repository/domain";
import type {
  DiscussionManagementCommand,
  DiscussionManagementIdentity,
  DiscussionManagementReceipt,
  DiscussionManagementStore,
  DiscussionManagementView,
  DiscussionPoll,
} from "../contracts/management.js";
import { DiscussionError } from "../domain.js";
import {
  advanceDiscussion,
  type CategoryRow,
  type CommentRow,
  canManage,
  canModerate,
  category,
  categoryEvent,
  commandFingerprint,
  comment,
  currentCategory,
  currentComment,
  currentDiscussion,
  type DiscussionRow,
  discussion,
  discussionEvent,
  discussionScope,
  labelsExist,
  nextDiscussionNumber,
  readableCategory,
  readReceipt,
  requireOperation,
  requireVersion,
  requireWritableRepository,
  storeReceipt,
} from "./postgres-management-helpers.js";

type PollRow = {
  id: string;
  discussion_id: string;
  question: string;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

function operationFor(
  command: DiscussionManagementCommand,
): "participate" | "triage" | "manage" | "lock-conversation" {
  if (
    command.action === "create-category" ||
    command.action === "update-category" ||
    command.action === "delete-category" ||
    command.action === "adopt-discussion"
  ) {
    return "manage";
  }
  if (command.action === "lock" || command.action === "unlock") {
    return "lock-conversation";
  }
  if (
    command.action === "add-labels" ||
    command.action === "remove-labels" ||
    command.action === "clear-labels"
  ) {
    return "triage";
  }
  return "participate";
}

function requireAuthorOrModerator(
  row: DiscussionRow,
  actor: string,
  permissions: readonly RepositoryPermission[],
) {
  if (row.author !== actor && !canModerate(permissions)) {
    throw new DiscussionError(403, "需要 Discussion 作者或 Repository triage 管理能力。");
  }
}

function requireAuthorOrManager(
  row: DiscussionRow,
  actor: string,
  permissions: readonly RepositoryPermission[],
) {
  if (row.author !== actor && !canManage(permissions)) {
    throw new DiscussionError(403, "需要 Discussion 作者或 Repository manage 能力。");
  }
}

function postgresConflict(error: unknown, message: string): never {
  const postgres = error as { code?: string };
  if (postgres.code === "23505" || postgres.code === "23503") {
    throw new DiscussionError(409, message);
  }
  throw error;
}

async function pollView(
  sql: Sql,
  discussionId: string,
  userId: string,
): Promise<DiscussionPoll | null> {
  const poll = (
    await sql.query("SELECT * FROM discussion_polls WHERE discussion_id=$1", [discussionId])
  ).rows[0] as PollRow | undefined;
  if (!poll) return null;
  const options = (
    await sql.query(
      `SELECT
         o.id,o.option,o.position,o.version,
         COUNT(v.user_id)::int AS vote_count,
         BOOL_OR(v.user_id=$2) AS viewer_has_voted
       FROM discussion_poll_options o
       LEFT JOIN discussion_poll_votes v
         ON v.poll_id=o.poll_id AND v.option_id=o.id
       WHERE o.poll_id=$1
       GROUP BY o.id,o.option,o.position,o.version
       ORDER BY o.position,o.id`,
      [poll.id, userId],
    )
  ).rows as Array<{
    id: string;
    option: string;
    position: number | string;
    version: number | string;
    vote_count: number | string;
    viewer_has_voted: boolean | null;
  }>;
  return {
    id: poll.id,
    question: poll.question,
    version: Number(poll.version),
    createdAt: Number(poll.created_at),
    updatedAt: Number(poll.updated_at),
    totalVoteCount: options.reduce((sum, option) => sum + Number(option.vote_count), 0),
    viewerHasVoted: options.some((option) => Boolean(option.viewer_has_voted)),
    options: options.map((option) => ({
      id: option.id,
      option: option.option,
      position: Number(option.position),
      version: Number(option.version),
      voteCount: Number(option.vote_count),
      viewerHasVoted: Boolean(option.viewer_has_voted),
    })),
  };
}

export class PostgresDiscussionManagementStore implements DiscussionManagementStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  view(
    identity: DiscussionManagementIdentity,
    repositoryId: string,
    discussionId?: string,
  ): Promise<DiscussionManagementView> {
    return this.db.transaction(async (sql) => {
      const selected = await discussionScope(sql, identity, repositoryId);
      const categoryRows = (
        await sql.query(
          "SELECT * FROM discussion_categories WHERE repository_id=$1 ORDER BY lower(name),id",
          [repositoryId],
        )
      ).rows as CategoryRow[];
      if (!discussionId) {
        return {
          repository: selected.repository,
          categories: categoryRows.map(category),
          discussion: null,
          comments: [],
          labelIds: [],
          answer: null,
          discussionUpvoteCount: 0,
          viewerHasUpvotedDiscussion: false,
          commentUpvotes: {},
          poll: null,
        };
      }

      const row = (
        await sql.query(
          `SELECT d.*,c.name AS category_name
           FROM discussions d
           LEFT JOIN discussion_categories c ON c.id=d.category_id
           WHERE d.repository_id=$1 AND d.id=$2 AND d.deleted_at IS NULL`,
          [repositoryId, discussionId],
        )
      ).rows[0] as (DiscussionRow & { category_name: string | null }) | undefined;
      if (!row) throw new DiscussionError(404, "找不到 Discussion。");

      const [commentRows, labelRows, answerRow, discussionVotes, commentVotes, poll] =
        await Promise.all([
          sql.query(
            `SELECT * FROM discussion_comments
             WHERE discussion_id=$1
             ORDER BY created_at,id`,
            [discussionId],
          ),
          sql.query(
            "SELECT label_id FROM discussion_labels WHERE discussion_id=$1 ORDER BY label_id",
            [discussionId],
          ),
          sql.query(
            "SELECT comment_id,chosen_by,chosen_at FROM discussion_answers WHERE discussion_id=$1",
            [discussionId],
          ),
          sql.query(
            `SELECT COUNT(*)::int AS count,
               BOOL_OR(user_id=$2) AS viewer_has_upvoted
             FROM discussion_upvotes
             WHERE discussion_id=$1`,
            [discussionId, identity.userId],
          ),
          sql.query(
            `SELECT
               c.id AS comment_id,
               COUNT(v.user_id)::int AS count,
               BOOL_OR(v.user_id=$2) AS viewer_has_upvoted
             FROM discussion_comments c
             LEFT JOIN discussion_comment_upvotes v ON v.comment_id=c.id
             WHERE c.discussion_id=$1
             GROUP BY c.id`,
            [discussionId, identity.userId],
          ),
          pollView(sql, discussionId, identity.userId),
        ]);

      const commentUpvotes: Record<string, { count: number; viewerHasUpvoted: boolean }> = {};
      for (const vote of commentVotes.rows as Array<{
        comment_id: string;
        count: number | string;
        viewer_has_upvoted: boolean | null;
      }>) {
        commentUpvotes[vote.comment_id] = {
          count: Number(vote.count),
          viewerHasUpvoted: Boolean(vote.viewer_has_upvoted),
        };
      }
      const rootVote = discussionVotes.rows[0] as
        | { count: number | string; viewer_has_upvoted: boolean | null }
        | undefined;
      const answer = answerRow.rows[0] as
        | { comment_id: string; chosen_by: string; chosen_at: number | string }
        | undefined;

      return {
        repository: selected.repository,
        categories: categoryRows.map(category),
        discussion: discussion(row, row.category_name ?? undefined),
        comments: (commentRows.rows as CommentRow[]).map(comment),
        labelIds: (labelRows.rows as Array<{ label_id: string }>).map((item) => item.label_id),
        answer: answer
          ? {
              commentId: answer.comment_id,
              chosenBy: answer.chosen_by,
              chosenAt: Number(answer.chosen_at),
            }
          : null,
        discussionUpvoteCount: Number(rootVote?.count ?? 0),
        viewerHasUpvotedDiscussion: Boolean(rootVote?.viewer_has_upvoted),
        commentUpvotes,
        poll,
      };
    });
  }

  execute(
    identity: DiscussionManagementIdentity,
    command: DiscussionManagementCommand,
    now: number,
  ): Promise<DiscussionManagementReceipt> {
    const fingerprint = commandFingerprint(command);
    return this.db.transaction(async (sql) => {
      const selected = await discussionScope(sql, identity, command.repositoryId);
      requireOperation(selected.repository.permissions, operationFor(command));

      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `discussion:${identity.userId}:${command.requestId}`,
      ]);
      const previous = (
        await sql.query(
          "SELECT fingerprint,result FROM discussion_commands WHERE actor=$1 AND request_id=$2",
          [identity.userId, command.requestId],
        )
      ).rows[0] as { fingerprint: string; result: unknown } | undefined;
      const replay = readReceipt(previous, fingerprint);
      if (replay) return replay;

      await requireWritableRepository(sql, command.repositoryId);
      let result: DiscussionManagementReceipt;

      if (command.action === "create-category") {
        const id = randomUUID();
        let row: CategoryRow;
        try {
          row = (
            await sql.query(
              `INSERT INTO discussion_categories(
                 id,repository_id,name,slug,description,emoji,is_answerable,
                 version,created_at,updated_at
               ) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$8)
               RETURNING *`,
              [
                id,
                command.repositoryId,
                command.name,
                command.slug,
                command.description,
                command.emoji,
                command.isAnswerable,
                now,
              ],
            )
          ).rows[0] as CategoryRow;
        } catch (error) {
          postgresConflict(error, "此 Repository 已有相同 slug 的 Discussion category。");
        }
        await categoryEvent(sql, id, 1, identity.userId, command.action, category(row!), now);
        result = {
          requestId: command.requestId,
          repositoryId: command.repositoryId,
          action: command.action,
          discussionId: null,
          categoryId: id,
          resourceId: id,
          version: 1,
          at: now,
          data: { category: category(row!) },
        };
      } else if (command.action === "update-category") {
        const before = await currentCategory(sql, command.repositoryId, command.categoryId);
        requireVersion(before.version, command.expectedVersion, "Discussion category");
        const name = command.name ?? before.name;
        const description = command.description ?? before.description;
        const emoji = command.emoji ?? before.emoji;
        const isAnswerable = command.isAnswerable ?? before.is_answerable;
        if (
          name === before.name &&
          description === before.description &&
          emoji === before.emoji &&
          isAnswerable === before.is_answerable
        ) {
          throw new DiscussionError(409, "Discussion category 沒有變更。");
        }
        if (before.is_answerable && !isAnswerable) {
          const answered = (
            await sql.query(
              `SELECT 1
               FROM discussion_answers a
               JOIN discussions d ON d.id=a.discussion_id
               WHERE d.category_id=$1
               LIMIT 1`,
              [before.id],
            )
          ).rows[0];
          if (answered) {
            throw new DiscussionError(409, "仍有已選答案的 Discussion，不能停用 answerable。");
          }
        }
        const row = (
          await sql.query(
            `UPDATE discussion_categories
             SET name=$3,description=$4,emoji=$5,is_answerable=$6,
                 version=version+1,updated_at=$7
             WHERE repository_id=$1 AND id=$2 AND version=$8
             RETURNING *`,
            [
              command.repositoryId,
              command.categoryId,
              name,
              description,
              emoji,
              isAnswerable,
              now,
              command.expectedVersion,
            ],
          )
        ).rows[0] as CategoryRow | undefined;
        if (!row) throw new DiscussionError(409, "Discussion category 已更新。");
        await categoryEvent(
          sql,
          row.id,
          Number(row.version),
          identity.userId,
          command.action,
          { before: category(before), after: category(row) },
          now,
        );
        result = {
          requestId: command.requestId,
          repositoryId: command.repositoryId,
          action: command.action,
          discussionId: null,
          categoryId: row.id,
          resourceId: row.id,
          version: Number(row.version),
          at: now,
          data: { category: category(row) },
        };
      } else if (command.action === "delete-category") {
        const before = await currentCategory(sql, command.repositoryId, command.categoryId);
        requireVersion(before.version, command.expectedVersion, "Discussion category");
        const used = (
          await sql.query("SELECT 1 FROM discussions WHERE category_id=$1 LIMIT 1", [before.id])
        ).rows[0];
        if (used) throw new DiscussionError(409, "Discussion category 仍被 Discussion 引用。");
        await categoryEvent(
          sql,
          before.id,
          Number(before.version) + 1,
          identity.userId,
          command.action,
          { deleted: category(before) },
          now,
        );
        await sql.query(
          "DELETE FROM discussion_categories WHERE repository_id=$1 AND id=$2 AND version=$3",
          [command.repositoryId, command.categoryId, command.expectedVersion],
        );
        result = {
          requestId: command.requestId,
          repositoryId: command.repositoryId,
          action: command.action,
          discussionId: null,
          categoryId: before.id,
          resourceId: before.id,
          version: Number(before.version) + 1,
          at: now,
          data: { deleted: true },
        };
      } else if (command.action === "create-discussion") {
        const selectedCategory = await readableCategory(
          sql,
          command.repositoryId,
          command.categoryId,
        );
        const id = randomUUID();
        const number = await nextDiscussionNumber(sql, command.repositoryId);
        const row = (
          await sql.query(
            `INSERT INTO discussions(
               id,repository_id,number,author,title,body,category,category_id,
               state,state_reason,closed_at,deleted_at,is_locked,lock_reason,
               version,created_at,updated_at
             ) VALUES(
               $1,$2,$3,$4,$5,$6,$7,$8,
               'OPEN',NULL,NULL,NULL,false,NULL,1,$9,$9
             )
             RETURNING *`,
            [
              id,
              command.repositoryId,
              number,
              identity.userId,
              command.title,
              command.body,
              selectedCategory.name,
              selectedCategory.id,
              now,
            ],
          )
        ).rows[0] as DiscussionRow;
        await discussionEvent(
          sql,
          row.id,
          1,
          identity.userId,
          command.action,
          { number, categoryId: selectedCategory.id },
          now,
        );
        result = {
          requestId: command.requestId,
          repositoryId: command.repositoryId,
          action: command.action,
          discussionId: row.id,
          categoryId: selectedCategory.id,
          resourceId: row.id,
          version: 1,
          at: now,
          data: { discussion: discussion(row, selectedCategory.name) },
        };
      } else {
        const row = await currentDiscussion(sql, command.repositoryId, command.discussionId);
        requireVersion(row.version, command.expectedVersion, "Discussion");
        const permissions = selected.repository.permissions;
        let data: Record<string, unknown> = {};
        let resourceId: string | null = null;
        let next = row;

        if (command.action === "adopt-discussion") {
          if (row.number !== null && row.category_id !== null) {
            throw new DiscussionError(409, "Discussion 已完成 canonical adoption。");
          }
          const selectedCategory = await readableCategory(
            sql,
            command.repositoryId,
            command.categoryId,
          );
          const number =
            row.number === null
              ? await nextDiscussionNumber(sql, command.repositoryId)
              : Number(row.number);
          next = await advanceDiscussion(sql, row, command.expectedVersion, now, {
            number,
            category: selectedCategory.name,
            categoryId: selectedCategory.id,
          });
          data = {
            legacyCategory: row.category,
            categoryId: selectedCategory.id,
            number,
          };
        } else if (command.action === "update-discussion") {
          requireAuthorOrModerator(row, identity.userId, permissions);
          let categoryName = row.category;
          if (command.categoryId !== undefined) {
            const selectedCategory = await readableCategory(
              sql,
              command.repositoryId,
              command.categoryId,
            );
            if (!selectedCategory.is_answerable) {
              const answer = (
                await sql.query("SELECT 1 FROM discussion_answers WHERE discussion_id=$1", [row.id])
              ).rows[0];
              if (answer) {
                throw new DiscussionError(
                  409,
                  "請先取消 chosen answer 再移至非 answerable category。",
                );
              }
            }
            categoryName = selectedCategory.name;
          }
          const title = command.title ?? row.title;
          const body = command.body ?? row.body;
          const categoryId = command.categoryId ?? row.category_id ?? undefined;
          if (
            title === row.title &&
            body === row.body &&
            categoryId === (row.category_id ?? undefined)
          ) {
            throw new DiscussionError(409, "Discussion 沒有變更。");
          }
          next = await advanceDiscussion(sql, row, command.expectedVersion, now, {
            title,
            body,
            category: categoryName,
            ...(categoryId ? { categoryId } : {}),
          });
          data = { titleChanged: title !== row.title, bodyChanged: body !== row.body, categoryId };
        } else if (command.action === "close-discussion") {
          requireAuthorOrModerator(row, identity.userId, permissions);
          if (row.state === "CLOSED") throw new DiscussionError(409, "Discussion 已關閉。");
          next = await advanceDiscussion(sql, row, command.expectedVersion, now, {
            state: "CLOSED",
            stateReason: command.stateReason,
            closedAt: now,
          });
          data = { state: "CLOSED", stateReason: command.stateReason };
        } else if (command.action === "reopen-discussion") {
          requireAuthorOrModerator(row, identity.userId, permissions);
          if (row.state === "OPEN") throw new DiscussionError(409, "Discussion 已開啟。");
          next = await advanceDiscussion(sql, row, command.expectedVersion, now, {
            state: "OPEN",
            stateReason: "REOPENED",
            closedAt: null,
          });
          data = { state: "OPEN", stateReason: "REOPENED" };
        } else if (command.action === "delete-discussion") {
          requireAuthorOrManager(row, identity.userId, permissions);
          if (row.is_locked && !canManage(permissions)) {
            throw new DiscussionError(409, "Discussion 已鎖定，目前權限不能刪除。");
          }
          next = await advanceDiscussion(sql, row, command.expectedVersion, now, {
            title: "[deleted]",
            body: "",
            state: "CLOSED",
            stateReason: row.state === "CLOSED" ? row.state_reason : null,
            closedAt: row.closed_at === null ? now : Number(row.closed_at),
            deletedAt: now,
          });
          data = { deleted: true };
        } else if (command.action === "add-comment") {
          if (row.state !== "OPEN") throw new DiscussionError(409, "Discussion 已關閉。");
          if (row.is_locked && !canManage(permissions)) {
            throw new DiscussionError(409, "Discussion 已鎖定，目前權限不能留言。");
          }
          if (command.replyToId) {
            const parent = await currentComment(sql, row.id, command.replyToId);
            if (parent.deleted_at !== null) {
              throw new DiscussionError(409, "不能回覆已刪除的 comment。");
            }
            if (parent.reply_to_id !== null) {
              throw new DiscussionError(409, "目前 replyTo 僅允許一層 thread。");
            }
          }
          resourceId = randomUUID();
          await sql.query(
            `INSERT INTO discussion_comments(
               id,discussion_id,author,body,reply_to_id,deleted_at,
               version,created_at,updated_at
             ) VALUES($1,$2,$3,$4,$5,NULL,1,$6,$6)`,
            [resourceId, row.id, identity.userId, command.body, command.replyToId, now],
          );
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
          data = { commentId: resourceId, replyToId: command.replyToId };
        } else if (command.action === "edit-comment" || command.action === "delete-comment") {
          const target = await currentComment(sql, row.id, command.commentId);
          requireVersion(target.version, command.commentVersion, "Discussion comment");
          if (target.deleted_at !== null)
            throw new DiscussionError(409, "Discussion comment 已刪除。");
          if (target.author !== identity.userId && !canModerate(permissions)) {
            throw new DiscussionError(403, "只能編輯自己的 comment 或使用 triage 管理能力。");
          }
          if (row.is_locked && !canManage(permissions)) {
            throw new DiscussionError(409, "Discussion 已鎖定，目前權限不能編輯 comment。");
          }
          resourceId = target.id;
          if (command.action === "edit-comment") {
            const changed = (
              await sql.query(
                `UPDATE discussion_comments
                 SET body=$3,version=version+1,updated_at=$4
                 WHERE discussion_id=$1 AND id=$2 AND version=$5 AND deleted_at IS NULL
                 RETURNING version`,
                [row.id, target.id, command.body, now, command.commentVersion],
              )
            ).rows[0] as { version: number | string } | undefined;
            if (!changed) throw new DiscussionError(409, "Discussion comment 已更新。");
            data = { commentId: target.id, commentVersion: Number(changed.version) };
          } else {
            await sql.query(
              `UPDATE discussion_comments
               SET body='',deleted_at=$3,version=version+1,updated_at=$3
               WHERE discussion_id=$1 AND id=$2 AND version=$4 AND deleted_at IS NULL`,
              [row.id, target.id, now, command.commentVersion],
            );
            const clearedAnswer = (
              await sql.query(
                "DELETE FROM discussion_answers WHERE discussion_id=$1 AND comment_id=$2 RETURNING comment_id",
                [row.id, target.id],
              )
            ).rows[0];
            data = { commentId: target.id, deleted: true, answerCleared: Boolean(clearedAnswer) };
          }
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
        } else if (command.action === "mark-answer" || command.action === "unmark-answer") {
          requireAuthorOrModerator(row, identity.userId, permissions);
          if (!row.category_id) {
            throw new DiscussionError(
              409,
              "Legacy category 尚未 adoption，不能管理 chosen answer。",
            );
          }
          const selectedCategory = await readableCategory(sql, row.repository_id, row.category_id);
          if (!selectedCategory.is_answerable) {
            throw new DiscussionError(409, "此 Discussion category 不支援 chosen answer。");
          }
          const target = await currentComment(sql, row.id, command.commentId);
          if (target.deleted_at !== null)
            throw new DiscussionError(409, "不能選取已刪除的 comment。");
          if (command.action === "mark-answer") {
            const before = (
              await sql.query("SELECT comment_id FROM discussion_answers WHERE discussion_id=$1", [
                row.id,
              ])
            ).rows[0] as { comment_id: string } | undefined;
            if (before?.comment_id === target.id) {
              throw new DiscussionError(409, "此 comment 已是 chosen answer。");
            }
            await sql.query(
              `INSERT INTO discussion_answers(discussion_id,comment_id,chosen_by,chosen_at)
               VALUES($1,$2,$3,$4)
               ON CONFLICT(discussion_id) DO UPDATE
               SET comment_id=EXCLUDED.comment_id,
                   chosen_by=EXCLUDED.chosen_by,
                   chosen_at=EXCLUDED.chosen_at`,
              [row.id, target.id, identity.userId, now],
            );
            data = { answerCommentId: target.id, previousCommentId: before?.comment_id ?? null };
          } else {
            const removed = (
              await sql.query(
                `DELETE FROM discussion_answers
                 WHERE discussion_id=$1 AND comment_id=$2
                 RETURNING comment_id`,
                [row.id, target.id],
              )
            ).rows[0];
            if (!removed) throw new DiscussionError(409, "此 comment 不是目前 chosen answer。");
            data = { answerCommentId: null, previousCommentId: target.id };
          }
          resourceId = target.id;
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
        } else if (
          command.action === "add-labels" ||
          command.action === "remove-labels" ||
          command.action === "clear-labels"
        ) {
          if (command.action === "add-labels") {
            if (!(await labelsExist(sql, row.repository_id, command.labelIds))) {
              throw new DiscussionError(409, "Label 必須存在於同一 Repository。");
            }
            const added = (
              await sql.query(
                `INSERT INTO discussion_labels(
                   repository_id,discussion_id,label_id,added_by,created_at
                 )
                 SELECT $1,$2,label_id,$4,$5
                 FROM unnest($3::text[]) AS label_id
                 ON CONFLICT DO NOTHING
                 RETURNING label_id`,
                [row.repository_id, row.id, command.labelIds, identity.userId, now],
              )
            ).rows as Array<{ label_id: string }>;
            if (!added.length) throw new DiscussionError(409, "Discussion labels 沒有變更。");
            data = { addedLabelIds: added.map((item) => item.label_id).sort() };
          } else if (command.action === "remove-labels") {
            const removed = (
              await sql.query(
                `DELETE FROM discussion_labels
                 WHERE discussion_id=$1 AND label_id=ANY($2::text[])
                 RETURNING label_id`,
                [row.id, command.labelIds],
              )
            ).rows as Array<{ label_id: string }>;
            if (!removed.length) throw new DiscussionError(409, "Discussion labels 沒有變更。");
            data = { removedLabelIds: removed.map((item) => item.label_id).sort() };
          } else {
            const removed = (
              await sql.query(
                "DELETE FROM discussion_labels WHERE discussion_id=$1 RETURNING label_id",
                [row.id],
              )
            ).rows as Array<{ label_id: string }>;
            if (!removed.length) throw new DiscussionError(409, "Discussion labels 已是空集合。");
            data = { removedLabelIds: removed.map((item) => item.label_id).sort() };
          }
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
        } else if (command.action === "add-upvote" || command.action === "remove-upvote") {
          if (command.subjectKind === "discussion") {
            if (command.subjectId !== row.id) {
              throw new DiscussionError(409, "Upvote subject 不屬於此 Discussion。");
            }
            if (command.action === "add-upvote") {
              const added = (
                await sql.query(
                  `INSERT INTO discussion_upvotes(discussion_id,user_id,created_at)
                   VALUES($1,$2,$3)
                   ON CONFLICT DO NOTHING
                   RETURNING user_id`,
                  [row.id, identity.userId, now],
                )
              ).rows[0];
              if (!added) throw new DiscussionError(409, "已對此 Discussion upvote。");
            } else {
              const removed = (
                await sql.query(
                  `DELETE FROM discussion_upvotes
                   WHERE discussion_id=$1 AND user_id=$2
                   RETURNING user_id`,
                  [row.id, identity.userId],
                )
              ).rows[0];
              if (!removed) throw new DiscussionError(409, "尚未對此 Discussion upvote。");
            }
          } else {
            const target = await currentComment(sql, row.id, command.subjectId);
            if (target.deleted_at !== null) {
              throw new DiscussionError(409, "不能 upvote 已刪除的 comment。");
            }
            if (command.action === "add-upvote") {
              const added = (
                await sql.query(
                  `INSERT INTO discussion_comment_upvotes(comment_id,user_id,created_at)
                   VALUES($1,$2,$3)
                   ON CONFLICT DO NOTHING
                   RETURNING user_id`,
                  [target.id, identity.userId, now],
                )
              ).rows[0];
              if (!added) throw new DiscussionError(409, "已對此 Discussion comment upvote。");
            } else {
              const removed = (
                await sql.query(
                  `DELETE FROM discussion_comment_upvotes
                   WHERE comment_id=$1 AND user_id=$2
                   RETURNING user_id`,
                  [target.id, identity.userId],
                )
              ).rows[0];
              if (!removed) {
                throw new DiscussionError(409, "尚未對此 Discussion comment upvote。");
              }
            }
          }
          data = {
            upvoted: command.action === "add-upvote",
            subjectKind: command.subjectKind,
            subjectId: command.subjectId,
          };
          resourceId = command.subjectId;
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
        } else if (command.action === "create-poll") {
          requireAuthorOrModerator(row, identity.userId, permissions);
          if (row.state !== "OPEN") throw new DiscussionError(409, "Discussion 已關閉。");
          const existing = (
            await sql.query("SELECT 1 FROM discussion_polls WHERE discussion_id=$1", [row.id])
          ).rows[0];
          if (existing) throw new DiscussionError(409, "Discussion 已有 Poll。");
          const pollId = randomUUID();
          await sql.query(
            `INSERT INTO discussion_polls(
               id,discussion_id,question,version,created_at,updated_at
             ) VALUES($1,$2,$3,1,$4,$4)`,
            [pollId, row.id, command.question, now],
          );
          for (let index = 0; index < command.options.length; index += 1) {
            await sql.query(
              `INSERT INTO discussion_poll_options(
                 id,poll_id,option,position,version
               ) VALUES($1,$2,$3,$4,1)`,
              [randomUUID(), pollId, command.options[index], index],
            );
          }
          resourceId = pollId;
          data = { pollId, question: command.question, options: command.options };
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
        } else if (command.action === "update-poll" || command.action === "replace-poll-options") {
          requireAuthorOrModerator(row, identity.userId, permissions);
          const poll = (
            await sql.query(
              "SELECT * FROM discussion_polls WHERE discussion_id=$1 AND id=$2 FOR UPDATE",
              [row.id, command.pollId],
            )
          ).rows[0] as PollRow | undefined;
          if (!poll) throw new DiscussionError(404, "找不到 Discussion Poll。");
          requireVersion(poll.version, command.pollVersion, "Discussion Poll");
          if (command.action === "update-poll") {
            if (poll.question === command.question)
              throw new DiscussionError(409, "Poll 沒有變更。");
            await sql.query(
              `UPDATE discussion_polls
               SET question=$3,version=version+1,updated_at=$4
               WHERE discussion_id=$1 AND id=$2 AND version=$5`,
              [row.id, poll.id, command.question, now, command.pollVersion],
            );
            data = { pollId: poll.id, question: command.question };
          } else {
            const votes = (
              await sql.query("SELECT 1 FROM discussion_poll_votes WHERE poll_id=$1 LIMIT 1", [
                poll.id,
              ])
            ).rows[0];
            if (votes) {
              throw new DiscussionError(409, "Poll 已有投票，不能替換選項；需保留可解釋歷史。");
            }
            await sql.query("DELETE FROM discussion_poll_options WHERE poll_id=$1", [poll.id]);
            for (let index = 0; index < command.options.length; index += 1) {
              await sql.query(
                `INSERT INTO discussion_poll_options(
                   id,poll_id,option,position,version
                 ) VALUES($1,$2,$3,$4,1)`,
                [randomUUID(), poll.id, command.options[index], index],
              );
            }
            await sql.query(
              `UPDATE discussion_polls
               SET version=version+1,updated_at=$3
               WHERE discussion_id=$1 AND id=$2 AND version=$4`,
              [row.id, poll.id, now, command.pollVersion],
            );
            data = { pollId: poll.id, options: command.options };
          }
          resourceId = poll.id;
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
        } else if (command.action === "add-poll-vote" || command.action === "remove-poll-vote") {
          if (row.state !== "OPEN") throw new DiscussionError(409, "Discussion 已關閉。");
          const option = (
            await sql.query(
              `SELECT o.id,o.poll_id
               FROM discussion_poll_options o
               JOIN discussion_polls p ON p.id=o.poll_id
               WHERE p.discussion_id=$1 AND o.id=$2`,
              [row.id, command.optionId],
            )
          ).rows[0] as { id: string; poll_id: string } | undefined;
          if (!option) throw new DiscussionError(404, "找不到 Discussion Poll option。");
          if (command.action === "add-poll-vote") {
            const added = (
              await sql.query(
                `INSERT INTO discussion_poll_votes(poll_id,option_id,user_id,created_at)
                 VALUES($1,$2,$3,$4)
                 ON CONFLICT DO NOTHING
                 RETURNING user_id`,
                [option.poll_id, option.id, identity.userId, now],
              )
            ).rows[0];
            if (!added) throw new DiscussionError(409, "已投給此 Poll option。");
            data = { optionId: option.id, voted: true };
          } else {
            const removed = (
              await sql.query(
                `DELETE FROM discussion_poll_votes
                 WHERE option_id=$1 AND user_id=$2
                 RETURNING user_id`,
                [option.id, identity.userId],
              )
            ).rows[0];
            if (!removed) throw new DiscussionError(409, "尚未投給此 Poll option。");
            data = { optionId: option.id, voted: false };
          }
          resourceId = option.id;
          next = await advanceDiscussion(sql, row, command.expectedVersion, now);
        } else if (command.action === "lock") {
          if (row.is_locked) throw new DiscussionError(409, "Discussion 已鎖定。");
          next = await advanceDiscussion(sql, row, command.expectedVersion, now, {
            locked: true,
            lockReason: command.reason,
          });
          data = { locked: true, reason: command.reason };
        } else {
          if (!row.is_locked) throw new DiscussionError(409, "Discussion 未鎖定。");
          next = await advanceDiscussion(sql, row, command.expectedVersion, now, {
            locked: false,
            lockReason: null,
          });
          data = { locked: false, previousReason: row.lock_reason };
        }

        await discussionEvent(
          sql,
          row.id,
          Number(next.version),
          identity.userId,
          command.action,
          data,
          now,
        );
        result = {
          requestId: command.requestId,
          repositoryId: command.repositoryId,
          action: command.action,
          discussionId: row.id,
          categoryId: next.category_id,
          resourceId,
          version: Number(next.version),
          at: now,
          data,
        };
      }

      await storeReceipt(sql, identity.userId, command, fingerprint, result, now);
      return result;
    });
  }
}

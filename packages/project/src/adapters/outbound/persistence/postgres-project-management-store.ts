import { randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { resolveAccountLogin } from "@line_bot_v1/namespace/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { repositoryScope } from "@line_bot_v1/repository/postgres/access";
import type {
  ProjectCollaborator,
  ProjectManagementCommand,
  ProjectManagementIdentity,
  ProjectManagementReceipt,
  ProjectManagementStore,
  ProjectManagementView,
} from "../../../contracts/management.js";
import { type ProjectAccessRole, ProjectError } from "../../../domain.js";
import {
  executeProjectFieldCommand,
  readProjectFields,
  readProjectFieldValues,
} from "./postgres-project-fields.js";
import { executeProjectItemCommand, readProjectItems } from "./postgres-project-items.js";
import {
  advanceProject,
  allocateProjectNumber,
  appendProjectEvent,
  lockProjectScope,
  type ProjectRow,
  projectFingerprint,
  projectRoot,
  readProjectReceipt,
  readProjectScope,
  requireProjectOwnerTarget,
  requireProjectRole,
  requireProjectTeamTarget,
  requireProjectVersion,
  storeProjectReceipt,
} from "./postgres-project-management-helpers.js";
import {
  executeProjectViewStatusCommand,
  readProjectStatusUpdates,
  readProjectViews,
} from "./postgres-project-view-status.js";

function collaboratorRole(
  role: Extract<
    ProjectManagementCommand,
    { action: "update-collaborators" }
  >["collaborators"][number]["role"],
): ProjectAccessRole | null {
  if (role === "NONE") return null;
  if (role === "READER") return "READ";
  if (role === "WRITER") return "WRITE";
  return "ADMIN";
}

async function projectCollaborators(sql: Sql, projectId: string): Promise<ProjectCollaborator[]> {
  const userRows = (
    await sql.query(
      `SELECT user_id AS id,role
       FROM project_user_access
       WHERE project_id=$1
       ORDER BY user_id`,
      [projectId],
    )
  ).rows as Array<{ id: string; role: ProjectAccessRole }>;
  const teamRows = (
    await sql.query(
      `SELECT team_id AS id,role
       FROM project_team_access
       WHERE project_id=$1
       ORDER BY team_id`,
      [projectId],
    )
  ).rows as Array<{ id: string; role: ProjectAccessRole }>;
  return [
    ...userRows.map((row) => ({ kind: "USER" as const, id: row.id, role: row.role })),
    ...teamRows.map((row) => ({ kind: "TEAM" as const, id: row.id, role: row.role })),
  ];
}

async function requireReadableRepository(sql: Sql, userId: string, repositoryId: string) {
  try {
    return await repositoryScope(sql, { userId }, repositoryId);
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw new ProjectError(error.status, error.message);
    }
    throw error;
  }
}

async function addRepositoryReference(
  sql: Sql,
  userId: string,
  projectId: string,
  repositoryId: string,
) {
  await requireReadableRepository(sql, userId, repositoryId);
  const existing = (
    await sql.query(
      `SELECT 1
       FROM project_repository_references
       WHERE project_id=$1 AND repository_id=$2`,
      [projectId, repositoryId],
    )
  ).rows[0];
  if (existing) return;
  const positionRow = (
    await sql.query(
      `SELECT COALESCE(MAX(position),-1)+1 AS position
       FROM project_repository_references
       WHERE project_id=$1`,
      [projectId],
    )
  ).rows[0] as { position: number | string };
  await sql.query(
    `INSERT INTO project_repository_references(
       project_id,repository_id,position,version
     ) VALUES($1,$2,$3,1)`,
    [projectId, repositoryId, Number(positionRow.position)],
  );
}

async function createProject(
  sql: Sql,
  identity: ProjectManagementIdentity,
  input: Readonly<{
    ownerAccountId: string;
    ownerKind: "USER" | "ORGANIZATION";
    title: string;
    public: boolean;
    repositoryId: string | null;
    teamId: string | null;
  }>,
  now: number,
) {
  await requireProjectOwnerTarget(sql, identity.userId, input.ownerAccountId, input.ownerKind);
  if (input.repositoryId) {
    await requireReadableRepository(sql, identity.userId, input.repositoryId);
  }
  if (input.teamId) {
    await requireProjectTeamTarget(sql, input.ownerAccountId, input.ownerKind, input.teamId);
  }

  const projectId = randomUUID();
  const number = await allocateProjectNumber(sql, input.ownerAccountId, input.ownerKind);
  const row = (
    await sql.query(
      `INSERT INTO projects(
         id,owner_account_id,owner_account_kind,number,creator,
         name,short_description,readme,is_public,closed,closed_at,
         deleted_at,version,created_at,updated_at
       ) VALUES(
         $1,$2,$3,$4,$5,$6,'','',$7,false,NULL,NULL,1,$8,$8
       )
       RETURNING *`,
      [
        projectId,
        input.ownerAccountId,
        input.ownerKind,
        number,
        identity.userId,
        input.title,
        input.public,
        now,
      ],
    )
  ).rows[0] as ProjectRow;

  if (input.repositoryId) {
    await addRepositoryReference(sql, identity.userId, projectId, input.repositoryId);
  }
  if (input.teamId) {
    await sql.query(
      `INSERT INTO project_team_access(
         project_id,team_id,role,version,created_at,updated_at
       ) VALUES($1,$2,'READ',1,$3,$3)`,
      [projectId, input.teamId, now],
    );
  }

  return row;
}

async function mutateCollaborators(
  sql: Sql,
  row: ProjectRow,
  command: Extract<ProjectManagementCommand, { action: "update-collaborators" }>,
  now: number,
) {
  const seen = new Set<string>();
  let changes = 0;
  for (const collaborator of command.collaborators) {
    const kind = collaborator.userId ? "USER" : "TEAM";
    const id = collaborator.userId ?? collaborator.teamId!;
    const key = `${kind}:${id}`;
    if (seen.has(key)) {
      throw new ProjectError(400, "Project collaborator 不可重複。");
    }
    seen.add(key);

    const role = collaboratorRole(collaborator.role);
    if (kind === "USER") {
      if (row.owner_account_kind === "USER" && row.owner_account_id === id) {
        throw new ProjectError(409, "Project owner 不需要重複 collaborator grant。");
      }
      if (role !== null) {
        const active = await readActiveUserQualification(sql, id, "share");
        if (!active) {
          throw new ProjectError(409, "Project collaborator User 目前不可用。");
        }
      }
      const before = (
        await sql.query(
          `SELECT role
           FROM project_user_access
           WHERE project_id=$1 AND user_id=$2
           FOR UPDATE`,
          [row.id, id],
        )
      ).rows[0] as { role: ProjectAccessRole } | undefined;
      if (role === null) {
        if (before) {
          await sql.query("DELETE FROM project_user_access WHERE project_id=$1 AND user_id=$2", [
            row.id,
            id,
          ]);
          changes += 1;
        }
      } else if (!before) {
        await sql.query(
          `INSERT INTO project_user_access(
             project_id,user_id,role,version,created_at,updated_at
           ) VALUES($1,$2,$3,1,$4,$4)`,
          [row.id, id, role, now],
        );
        changes += 1;
      } else if (before.role !== role) {
        await sql.query(
          `UPDATE project_user_access
           SET role=$3,version=version+1,updated_at=$4
           WHERE project_id=$1 AND user_id=$2`,
          [row.id, id, role, now],
        );
        changes += 1;
      }
      continue;
    }

    if (role !== null) {
      await requireProjectTeamTarget(sql, row.owner_account_id, row.owner_account_kind, id);
    }
    const before = (
      await sql.query(
        `SELECT role
         FROM project_team_access
         WHERE project_id=$1 AND team_id=$2
         FOR UPDATE`,
        [row.id, id],
      )
    ).rows[0] as { role: ProjectAccessRole } | undefined;
    if (role === null) {
      if (before) {
        await sql.query("DELETE FROM project_team_access WHERE project_id=$1 AND team_id=$2", [
          row.id,
          id,
        ]);
        changes += 1;
      }
    } else if (!before) {
      await sql.query(
        `INSERT INTO project_team_access(
           project_id,team_id,role,version,created_at,updated_at
         ) VALUES($1,$2,$3,1,$4,$4)`,
        [row.id, id, role, now],
      );
      changes += 1;
    } else if (before.role !== role) {
      await sql.query(
        `UPDATE project_team_access
         SET role=$3,version=version+1,updated_at=$4
         WHERE project_id=$1 AND team_id=$2`,
        [row.id, id, role, now],
      );
      changes += 1;
    }
  }
  if (!changes) throw new ProjectError(409, "Project collaborators 沒有變更。");
  return { changedCollaborators: changes };
}

function isItemCommand(command: ProjectManagementCommand) {
  return (
    command.action === "add-issue-item" ||
    command.action === "add-draft-item" ||
    command.action === "update-draft-item" ||
    command.action === "archive-item" ||
    command.action === "unarchive-item" ||
    command.action === "delete-item" ||
    command.action === "move-item" ||
    command.action === "convert-draft-item"
  );
}

function isFieldCommand(command: ProjectManagementCommand) {
  return (
    command.action === "create-field" ||
    command.action === "update-field" ||
    command.action === "delete-field" ||
    command.action === "set-field-value" ||
    command.action === "clear-field-value"
  );
}

function isViewStatusCommand(command: ProjectManagementCommand) {
  return (
    command.action === "create-view" ||
    command.action === "update-view" ||
    command.action === "delete-view" ||
    command.action === "create-status-update" ||
    command.action === "update-status-update" ||
    command.action === "delete-status-update"
  );
}

async function validateDraftAssignees(sql: Sql, command: ProjectManagementCommand) {
  const ids =
    command.action === "add-draft-item"
      ? command.assigneeIds
      : command.action === "update-draft-item"
        ? (command.assigneeIds ?? [])
        : [];
  for (const userId of ids) {
    if (!(await readActiveUserQualification(sql, userId, "share"))) {
      throw new ProjectError(409, "DraftIssue assignee 目前不可用。");
    }
  }
}

export class PostgresProjectManagementStore implements ProjectManagementStore {
  constructor(private readonly db: Database = businessDatabase()) {}

  view(identity: ProjectManagementIdentity, projectId: string): Promise<ProjectManagementView> {
    return this.db.transaction(async (sql) => {
      const selected = await readProjectScope(sql, identity.userId, projectId);
      const items = await readProjectItems(sql, identity.userId, projectId);
      const visibleItemIds = items.map((item) => item.id);
      const [collaborators, fields, fieldValues, views, statusUpdates] =
        await Promise.all([
          projectCollaborators(sql, projectId),
          readProjectFields(sql, projectId),
          readProjectFieldValues(sql, projectId, visibleItemIds),
          readProjectViews(sql, projectId),
          readProjectStatusUpdates(sql, projectId),
        ]);
      return {
        project: projectRoot(selected.row),
        role: selected.role,
        collaborators,
        items,
        fields,
        fieldValues,
        views,
        statusUpdates,
      };
    });
  }

  viewByNumber(
    identity: ProjectManagementIdentity,
    ownerLogin: string,
    projectNumber: number,
  ): Promise<ProjectManagementView> {
    return this.db.transaction(async (sql) => {
      const owner = await resolveAccountLogin(sql, ownerLogin);
      if (!owner || (owner.kind !== "USER" && owner.kind !== "ORGANIZATION")) {
        throw new ProjectError(404, "找不到 Project owner。");
      }
      const row = (
        await sql.query(
          `SELECT id
           FROM projects
           WHERE owner_account_id=$1
             AND owner_account_kind=$2
             AND number=$3
             AND deleted_at IS NULL`,
          [owner.id, owner.kind, projectNumber],
        )
      ).rows[0] as { id: string } | undefined;
      if (!row) throw new ProjectError(404, "找不到 Project。");
      const selected = await readProjectScope(sql, identity.userId, row.id);
      const items = await readProjectItems(sql, identity.userId, row.id);
      const visibleItemIds = items.map((item) => item.id);
      const [collaborators, fields, fieldValues, views, statusUpdates] =
        await Promise.all([
          projectCollaborators(sql, row.id),
          readProjectFields(sql, row.id),
          readProjectFieldValues(sql, row.id, visibleItemIds),
          readProjectViews(sql, row.id),
          readProjectStatusUpdates(sql, row.id),
        ]);
      return {
        project: projectRoot(selected.row),
        role: selected.role,
        collaborators,
        items,
        fields,
        fieldValues,
        views,
        statusUpdates,
      };
    });
  }

  execute(
    identity: ProjectManagementIdentity,
    command: ProjectManagementCommand,
    now: number,
  ): Promise<ProjectManagementReceipt> {
    const fingerprint = projectFingerprint(command);
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `project-request:${identity.userId}:${command.requestId}`,
      ]);

      const replay = await readProjectReceipt(
        sql,
        identity.userId,
        command.requestId,
        fingerprint,
      );
      if (replay) {
        await readProjectScope(
          sql,
          identity.userId,
          replay.projectId,
          true,
        );
        return replay;
      }

      if (command.action === "create-project") {
        const row = await createProject(sql, identity, command, now);
        const data = {
          ownerAccountId: row.owner_account_id,
          ownerKind: row.owner_account_kind,
          number: Number(row.number),
        };
        await appendProjectEvent(
          sql,
          row.id,
          1,
          identity.userId,
          command.action,
          data,
          now,
        );
        const result: ProjectManagementReceipt = {
          requestId: command.requestId,
          action: command.action,
          projectId: row.id,
          resourceId: row.id,
          version: 1,
          at: now,
          data,
        };
        await storeProjectReceipt(
          sql,
          identity.userId,
          fingerprint,
          result,
          now,
        );
        return result;
      }

      if (command.action === "copy-project") {
        const source = await lockProjectScope(
          sql,
          identity.userId,
          command.sourceProjectId,
        );
        requireProjectVersion(source.row, command.sourceExpectedVersion);
        const copied = await createProject(
          sql,
          identity,
          {
            ownerAccountId: command.ownerAccountId,
            ownerKind: command.ownerKind,
            title: command.title,
            public: false,
            repositoryId: null,
            teamId: null,
          },
          now,
        );

        const sourceItems = await readProjectItems(
          sql,
          identity.userId,
          source.row.id,
        );
        for (const item of sourceItems) {
          if (item.kind === "ISSUE" && item.issue) {
            await executeProjectItemCommand(
              sql,
              identity.userId,
              copied.id,
              {
                requestId: command.requestId,
                action: "add-issue-item",
                projectId: copied.id,
                expectedVersion: 1,
                issueId: item.issue.id,
              },
              now,
            );
          } else if (
            command.includeDraftIssues &&
            item.kind === "DRAFT_ISSUE" &&
            item.draft &&
            !item.draft.deleted
          ) {
            await executeProjectItemCommand(
              sql,
              identity.userId,
              copied.id,
              {
                requestId: command.requestId,
                action: "add-draft-item",
                projectId: copied.id,
                expectedVersion: 1,
                title: item.draft.title ?? "",
                body: item.draft.body ?? "",
                assigneeIds: item.draft.assigneeIds,
              },
              now,
            );
          }
        }

        const data = {
          sourceProjectId: source.row.id,
          number: Number(copied.number),
          includeDraftIssues: command.includeDraftIssues,
          copiedItems: sourceItems.filter(
            (item) => item.kind === "ISSUE" || command.includeDraftIssues,
          ).length,
        };
        await appendProjectEvent(
          sql,
          copied.id,
          1,
          identity.userId,
          command.action,
          data,
          now,
        );
        const result: ProjectManagementReceipt = {
          requestId: command.requestId,
          action: command.action,
          projectId: copied.id,
          resourceId: copied.id,
          version: 1,
          at: now,
          data,
        };
        await storeProjectReceipt(
          sql,
          identity.userId,
          fingerprint,
          result,
          now,
        );
        return result;
      }

      const selected = await lockProjectScope(
        sql,
        identity.userId,
        command.projectId,
      );
      requireProjectVersion(selected.row, command.expectedVersion);

      const adminActions = new Set<ProjectManagementCommand["action"]>([
        "adopt-project",
        "update-project",
        "close-project",
        "reopen-project",
        "delete-project",
        "update-collaborators",
      ]);
      requireProjectRole(
        selected.role,
        adminActions.has(command.action) ? "ADMIN" : "WRITE",
      );

      if (
        selected.row.closed &&
        command.action !== "reopen-project" &&
        command.action !== "update-project" &&
        command.action !== "update-collaborators" &&
        command.action !== "delete-project"
      ) {
        throw new ProjectError(409, "Project 已關閉，目前 planning facts 為唯讀。");
      }

      let resourceId: string | null = null;
      let data: Record<string, unknown> = {};
      let next: ProjectRow;

      if (command.action === "adopt-project") {
        if (selected.row.number !== null) {
          throw new ProjectError(409, "Project 已完成 canonical number adoption。");
        }
        const number = await allocateProjectNumber(
          sql,
          selected.row.owner_account_id,
          selected.row.owner_account_kind,
        );
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
          { number },
        );
        data = { number };
      } else if (command.action === "update-project") {
        const title = command.title ?? selected.row.name;
        const shortDescription =
          command.shortDescription ?? selected.row.short_description;
        const readme = command.readme ?? selected.row.readme;
        const publicValue = command.public ?? selected.row.is_public;
        if (
          title === selected.row.name &&
          shortDescription === selected.row.short_description &&
          readme === selected.row.readme &&
          publicValue === selected.row.is_public
        ) {
          throw new ProjectError(409, "Project 沒有變更。");
        }
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
          {
            title,
            shortDescription,
            readme,
            public: publicValue,
          },
        );
        data = {
          titleChanged: title !== selected.row.name,
          shortDescriptionChanged:
            shortDescription !== selected.row.short_description,
          readmeChanged: readme !== selected.row.readme,
          public: publicValue,
        };
      } else if (command.action === "close-project") {
        if (selected.row.closed) throw new ProjectError(409, "Project 已關閉。");
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
          { closed: true, closedAt: now },
        );
        data = { closed: true };
      } else if (command.action === "reopen-project") {
        if (!selected.row.closed) throw new ProjectError(409, "Project 已開啟。");
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
          { closed: false, closedAt: null },
        );
        data = { closed: false };
      } else if (command.action === "delete-project") {
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
          {
            title: "[deleted]",
            shortDescription: "",
            readme: "",
            public: false,
            closed: true,
            closedAt:
              selected.row.closed_at === null
                ? now
                : Number(selected.row.closed_at),
            deletedAt: now,
          },
        );
        data = { deleted: true };
      } else if (command.action === "update-collaborators") {
        data = await mutateCollaborators(
          sql,
          selected.row,
          command,
          now,
        );
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
        );
      } else if (isItemCommand(command)) {
        await validateDraftAssignees(sql, command);
        const child = await executeProjectItemCommand(
          sql,
          identity.userId,
          selected.row.id,
          command,
          now,
        );
        resourceId = child.resourceId;
        data = child.data;
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
        );
      } else if (isFieldCommand(command)) {
        const child = await executeProjectFieldCommand(
          sql,
          selected.row.id,
          command,
          now,
        );
        resourceId = child.resourceId;
        data = child.data;
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
        );
      } else if (isViewStatusCommand(command)) {
        const child = await executeProjectViewStatusCommand(
          sql,
          identity.userId,
          selected.row.id,
          command,
          now,
        );
        resourceId = child.resourceId;
        data = child.data;
        next = await advanceProject(
          sql,
          selected.row,
          command.expectedVersion,
          now,
        );
      } else {
        throw new ProjectError(400, "Project 操作不正確。");
      }

      await appendProjectEvent(
        sql,
        selected.row.id,
        Number(next.version),
        identity.userId,
        command.action,
        data,
        now,
      );
      const result: ProjectManagementReceipt = {
        requestId: command.requestId,
        action: command.action,
        projectId: selected.row.id,
        resourceId,
        version: Number(next.version),
        at: now,
        data,
      };
      await storeProjectReceipt(
        sql,
        identity.userId,
        fingerprint,
        result,
        now,
      );
      return result;
    });
  }
}

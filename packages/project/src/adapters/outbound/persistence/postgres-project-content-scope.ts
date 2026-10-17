import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import type { Sql } from "@line_bot_v1/platform/postgres";
import { booleanValue } from "@line_bot_v1/platform/validation";
import type {
  ProjectContentScope,
  ProjectContentScopeReader,
} from "../../../contracts/output/content-scope.js";
import { ProjectError } from "../../../domain.js";
import {
  decodeProjectRow,
  effectiveProjectRole,
  type ProjectRow,
} from "./postgres-project-management-helpers.js";

export class PostgresProjectContentScope implements ProjectContentScopeReader {
  constructor(private readonly sql: Sql) {}

  async read(userId: string, projectId: string): Promise<ProjectContentScope> {
    await this.sql.query("SELECT app_private.lock_governance('shared')");
    if (!(await readActiveUserQualification(this.sql, userId, "share"))) {
      throw new ProjectError(403, "目前 User 資格不可用。");
    }

    await this.sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`project:${projectId}`]);
    const row = (
      await this.sql.query(
        "SELECT * FROM projects WHERE id=$1 FOR UPDATE",
        [projectId],
        decodeProjectRow,
      )
    ).rows[0];
    if (!row || row.deleted_at !== null) throw new ProjectError(404, "找不到 Project。");

    // Recompute only after the Project lock: a grant or lifecycle writer may have committed
    // while this transaction was waiting for the current scope.
    const role = await effectiveProjectRole(this.sql, row, userId);
    if (!role) throw new ProjectError(404, "找不到可存取的 Project。");

    const grants = (
      await this.sql.query(
        `SELECT
           EXISTS(SELECT 1 FROM project_user_access WHERE project_id=$1)
           OR EXISTS(SELECT 1 FROM project_team_access WHERE project_id=$1)
           AS has_collaborator_grants`,
        [row.id],
        (grantRow) => ({
          hasCollaboratorGrants: booleanValue(grantRow.has_collaborator_grants),
        }),
      )
    ).rows[0];
    if (!grants) throw new ProjectError(503, "無法確認 Project collaborator grants。");

    return contentScope(row, role, grants.hasCollaboratorGrants);
  }
}

function contentScope(
  row: ProjectRow,
  role: ProjectContentScope["role"],
  hasCollaboratorGrants: boolean,
): ProjectContentScope {
  return {
    project: {
      id: row.id,
      ownerAccountId: row.owner_account_id,
      ownerKind: row.owner_account_kind,
      title: row.name,
      number: row.number === null ? null : Number(row.number),
      public: row.is_public,
      hasCollaboratorGrants,
    },
    role,
    closed: row.closed,
  };
}

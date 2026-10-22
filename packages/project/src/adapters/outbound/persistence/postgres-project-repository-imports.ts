import { randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { IssueError } from "@line_bot_v1/issue/domain";
import { readProjectImportIssueReferences } from "@line_bot_v1/issue/postgres/project-reference";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  literalValue,
  numberValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import { repositoryScope } from "@line_bot_v1/repository/postgres/access";
import type { ProjectManagementView } from "../../../contracts/management.js";
import { ProjectError } from "../../../domain.js";
import { ensureRepositoryReference } from "./postgres-project-items.js";
import {
  advanceProject,
  appendProjectEvent,
  decodeProjectRow,
  lockProjectScope,
  requireProjectRole,
} from "./postgres-project-management-helpers.js";

type ImportState = "OPEN" | "CLOSED" | "ALL";

async function sourceCandidates(
  sql: Sql,
  input: Parameters<typeof readProjectImportIssueReferences>[1],
) {
  try {
    return await readProjectImportIssueReferences(sql, input);
  } catch (error) {
    if (error instanceof IssueError) throw new ProjectError(error.status, error.message);
    throw error;
  }
}

export async function readProjectImports(
  sql: Sql,
  userId: string,
  projectId: string,
): Promise<NonNullable<ProjectManagementView["repositoryImports"]>> {
  const rows = (
    await sql.query(
      "SELECT * FROM project_repository_imports WHERE project_id=$1 ORDER BY repository_id",
      [projectId],
      decodeRule,
    )
  ).rows;
  const result: NonNullable<ProjectManagementView["repositoryImports"]>[number][] = [];
  for (const rule of rows) {
    try {
      const scope = await repositoryScope(sql, { userId }, rule.repositoryId);
      const ownerLogin = scope.repository.ownerLogin;
      if (ownerLogin)
        result.push({
          repositoryId: rule.repositoryId,
          repositoryName: scope.repository.name,
          ownerLogin,
          state: rule.state,
          enabled: rule.enabled,
        });
    } catch (error) {
      if (error instanceof RepositoryError && (error.status === 403 || error.status === 404))
        continue;
      throw error;
    }
  }
  return result;
}

function decodeRule(row: Record<string, unknown>) {
  return {
    projectId: stringValue(row.project_id),
    repositoryId: stringValue(row.repository_id),
    state: literalValue(row.issue_state, ["OPEN", "CLOSED", "ALL"] as const),
    enabled: booleanValue(row.enabled),
    actor: stringValue(row.delegate_user_id),
    qualificationVersion: numberValue(row.delegate_status_version),
  };
}

async function importProjectIssueBatch(
  sql: Sql,
  userId: string,
  projectId: string,
  repositoryId: string,
  state: ImportState,
  now: number,
) {
  const excluded = (
    await sql.query(
      `SELECT issue_id FROM project_items WHERE project_id=$1 AND issue_id IS NOT NULL
     UNION SELECT issue_id FROM project_repository_import_exclusions WHERE project_id=$1`,
      [projectId],
      (row) => ({ id: stringValue(row.issue_id) }),
    )
  ).rows.map((row) => row.id);
  const candidates = await sourceCandidates(sql, {
    userId,
    repositoryId,
    state,
    excludeIds: excluded,
    limit: 101,
  });
  const batch = candidates.slice(0, 100);
  if (batch.length) {
    await sql.query(
      `INSERT INTO project_items(id,project_id,repository_id,issue_id,draft_issue_id,source_version,position,archived,version,created_at,updated_at)
       SELECT candidate.id,$1,$2,candidate.issue_id,NULL,candidate.source_version,
         COALESCE((SELECT MAX(position)+1 FROM project_items WHERE project_id=$1),0)+candidate.ordinality-1,
         false,1,$3,$3
       FROM unnest($4::text[],$5::text[],$6::integer[]) WITH ORDINALITY AS candidate(id,issue_id,source_version,ordinality)`,
      [
        projectId,
        repositoryId,
        now,
        batch.map(() => randomUUID()),
        batch.map((issue) => issue.id),
        batch.map((issue) => issue.version),
      ],
    );
  }
  return { importedItems: batch.length, importPending: candidates.length > batch.length };
}

export async function configureProjectImport(
  sql: Sql,
  userId: string,
  projectId: string,
  repositoryId: string,
  state: ImportState | null,
  now: number,
) {
  if (state === null) {
    await sql.query(
      "UPDATE project_repository_imports SET enabled=false WHERE project_id=$1 AND repository_id=$2",
      [projectId, repositoryId],
    );
    return { repositoryId, importIssues: null, importedItems: 0, importPending: false };
  }
  const qualification = await readActiveUserQualification(sql, userId, "share");
  if (!qualification) throw new ProjectError(403, "目前 User 資格不可用。");
  await sourceCandidates(sql, {
    userId,
    repositoryId,
    state,
    excludeIds: [],
    limit: 1,
  });
  await ensureRepositoryReference(sql, projectId, repositoryId);
  await sql.query(
    `INSERT INTO project_repository_imports(project_id,repository_id,issue_state,enabled,delegate_user_id,delegate_status_version,checked_at)
     VALUES($1,$2,$3,true,$4,$5,$6)
     ON CONFLICT(project_id,repository_id) DO UPDATE SET issue_state=excluded.issue_state,enabled=true,
       delegate_user_id=excluded.delegate_user_id,delegate_status_version=excluded.delegate_status_version,checked_at=excluded.checked_at`,
    [projectId, repositoryId, state, userId, qualification.statusVersion, now],
  );
  return {
    repositoryId,
    importIssues: state,
    ...(await importProjectIssueBatch(sql, userId, projectId, repositoryId, state, now)),
  };
}

/** Each admission batch owns one transaction; overlap, restart and retries do not duplicate Items. */
export class PostgresProjectRepositoryImports {
  constructor(private readonly db: Database) {}

  async once(limit = 20, now = Date.now()) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ProjectError(400, "匯入處理批次不正確。");
    const candidates = await this.db.transaction(
      async (sql) =>
        (
          await sql.query(
            `SELECT r.* FROM project_repository_imports r JOIN projects p ON p.id=r.project_id
       WHERE r.enabled AND NOT p.closed AND p.deleted_at IS NULL
       ORDER BY r.checked_at,r.project_id,r.repository_id LIMIT $1`,
            [limit],
            decodeRule,
          )
        ).rows,
    );
    let importedItems = 0;
    let paused = 0;
    for (const candidate of candidates) {
      const result = await this.db.transaction(async (sql) => {
        await sql.query("SELECT app_private.lock_governance('shared')");
        const acquired = (
          await sql.query(
            "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
            [`project:${candidate.projectId}`],
            (row) => ({ value: booleanValue(row.acquired) }),
          )
        ).rows[0]?.value;
        if (!acquired) return { importedItems: 0, paused: 0 };
        const rule = (
          await sql.query(
            "SELECT * FROM project_repository_imports WHERE project_id=$1 AND repository_id=$2 FOR UPDATE",
            [candidate.projectId, candidate.repositoryId],
            decodeRule,
          )
        ).rows[0];
        if (!rule?.enabled) return { importedItems: 0, paused: 0 };
        const project = (
          await sql.query(
            "SELECT * FROM projects WHERE id=$1 FOR UPDATE",
            [rule.projectId],
            decodeProjectRow,
          )
        ).rows[0];
        if (!project || project.closed || project.deleted_at !== null)
          return { importedItems: 0, paused: 0 };
        try {
          const actor = await readActiveUserQualification(sql, rule.actor, "share");
          if (!actor || actor.statusVersion !== rule.qualificationVersion)
            throw new ProjectError(403, "匯入授權已失效。");
          const scope = await lockProjectScope(sql, rule.actor, rule.projectId);
          requireProjectRole(scope.role, "ADMIN");
          if (scope.row.closed) return { importedItems: 0, paused: 0 };
          const batch = await importProjectIssueBatch(
            sql,
            rule.actor,
            rule.projectId,
            rule.repositoryId,
            rule.state,
            now,
          );
          if (batch.importedItems) {
            const next = await advanceProject(sql, scope.row, Number(scope.row.version), now);
            await appendProjectEvent(
              sql,
              rule.projectId,
              Number(next.version),
              rule.actor,
              "import-repository-items",
              { repositoryId: rule.repositoryId, ...batch },
              now,
            );
          }
          await sql.query(
            "UPDATE project_repository_imports SET checked_at=$3 WHERE project_id=$1 AND repository_id=$2",
            [rule.projectId, rule.repositoryId, now],
          );
          return { importedItems: batch.importedItems, paused: 0 };
        } catch (error) {
          if (
            (error instanceof ProjectError || error instanceof RepositoryError) &&
            (error.status === 403 || error.status === 404)
          ) {
            await sql.query(
              "UPDATE project_repository_imports SET enabled=false,checked_at=$3 WHERE project_id=$1 AND repository_id=$2",
              [rule.projectId, rule.repositoryId, now],
            );
            const next = await advanceProject(sql, project, Number(project.version), now);
            await appendProjectEvent(
              sql,
              rule.projectId,
              Number(next.version),
              rule.actor,
              "pause-repository-import",
              { repositoryId: rule.repositoryId },
              now,
            );
            return { importedItems: 0, paused: 1 };
          }
          throw error;
        }
      });
      importedItems += result.importedItems;
      paused += result.paused;
    }
    return { checked: candidates.length, importedItems, paused };
  }
}

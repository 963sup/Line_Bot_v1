import { createHash, randomUUID } from "node:crypto";
import {
  businessDatabase,
  type Database,
  type Sql,
  type SqlRow,
} from "@line_bot_v1/platform/postgres";
import {
  booleanValue,
  isRecord,
  numberValue,
  numericValue,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { createPostgresProjectContentScope } from "@line_bot_v1/project/composition/bootstrap/project-content-scope";
import { ProjectError } from "@line_bot_v1/project/domain";
import type {
  ProjectWbsGovernanceCommand,
  ProjectWbsGovernanceQuery,
  ProjectWbsGovernanceReceipt,
  ProjectWbsGovernanceView,
} from "../../../contracts/dto/project-governance.js";
import type {
  ProjectWbsGovernanceStore,
  ProjectWbsGovernanceTransaction,
} from "../../../contracts/repositories/project-governance.js";
import type { WbsRevision } from "../../../domain/content.js";
import { parseWbsDocument, WbsError } from "../../../domain/document.js";
import {
  checkWbsPublication,
  compareWbsDocuments,
  defaultWbsPolicy,
  type WbsPolicy,
} from "../../../domain/governance.js";
import { canEditProjectWbs, canReviewProjectWbs } from "../../../domain/policies/project-access.js";
import {
  isWbsReviewerEligible,
  summarizeWbsReviews,
  type WbsBaseline,
  type WbsProposal,
  type WbsReview,
} from "../../../domain/scope-governance.js";
import { PostgresWbsScopeBoundary } from "./scope-boundary.js";

const nullable = (value: unknown) => (value === null ? null : stringValue(value));
function policy(row: SqlRow): WbsPolicy {
  return {
    version: numberValue(row.policy_version),
    minimumApprovals: numberValue(row.minimum_approvals),
    allowSelfApproval: booleanValue(row.allow_self_approval),
  };
}
function proposal(row: SqlRow): WbsProposal {
  const status = stringValue(row.status);
  if (status !== "OPEN" && status !== "CLOSED" && status !== "PUBLISHED")
    throw new WbsError(503, "提案狀態無法讀取。");
  return {
    id: stringValue(row.id),
    number: numberValue(row.number),
    title: stringValue(row.title),
    reason: stringValue(row.reason),
    status,
    version: numberValue(row.version),
    candidateRevisionId: stringValue(row.candidate_revision_id),
    baseBaselineId: nullable(row.base_baseline_id),
    authorUserId: stringValue(row.author_user_id),
    proposerUserId: stringValue(row.proposer_user_id),
    createdAt: Number(numericValue(row.created_at)),
    updatedAt: Number(numericValue(row.updated_at)),
  };
}
const proposalSelect =
  "SELECT p.id,p.project_id,p.number,p.author_user_id,p.created_at,p.version AS current_version,v.version,v.actor_user_id AS proposer_user_id,v.title,v.reason,v.status,v.candidate_revision_id,v.base_baseline_id,v.at AS updated_at FROM project_wbs_proposals p JOIN project_wbs_proposal_versions v ON v.project_id=p.project_id AND v.proposal_id=p.id";
async function loadProposal(
  sql: Sql,
  projectId: string,
  id: string,
  version?: number,
  lock = false,
) {
  const row = (
    await sql.query(
      `${proposalSelect} AND v.version=COALESCE($3::integer,p.version) WHERE p.project_id=$1 AND p.id=$2${lock ? " FOR UPDATE OF p" : ""}`,
      [projectId, id, version ?? null],
    )
  ).rows[0];
  return row ? { proposal: proposal(row), currentVersion: numberValue(row.current_version) } : null;
}
async function appendProposalVersion(
  sql: Sql,
  projectId: string,
  item: Pick<
    WbsProposal,
    "id" | "version" | "title" | "reason" | "status" | "candidateRevisionId" | "baseBaselineId"
  >,
  actor: string,
  now: number,
) {
  await sql.query(
    "INSERT INTO project_wbs_proposal_versions(project_id,proposal_id,version,title,reason,status,candidate_revision_id,base_baseline_id,actor_user_id,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      projectId,
      item.id,
      item.version,
      item.title,
      item.reason,
      item.status,
      item.candidateRevisionId,
      item.baseBaselineId,
      actor,
      now,
    ],
  );
}
function decodeReview(row: SqlRow, eligible: boolean): WbsReview {
  const decision = stringValue(row.decision);
  if (decision !== "APPROVE" && decision !== "REQUEST_CHANGES")
    throw new WbsError(503, "審查結果無法讀取。");
  return {
    id: stringValue(row.id),
    proposalVersion: numberValue(row.proposal_version),
    candidateRevisionId: stringValue(row.candidate_revision_id),
    policyVersion: numberValue(row.policy_version),
    reviewerUserId: stringValue(row.reviewer_user_id),
    decision,
    note: stringValue(row.note),
    at: Number(numericValue(row.at)),
    sequence: numberValue(row.sequence),
    eligible,
  };
}
function baseline(row: SqlRow): WbsBaseline {
  if (!Array.isArray(row.approval_review_ids))
    throw new WbsError(503, "Baseline 核准證據無法讀取。");
  return {
    id: stringValue(row.id),
    number: numberValue(row.number),
    proposalId: stringValue(row.proposal_id),
    proposalVersion: numberValue(row.proposal_version),
    revisionId: stringValue(row.revision_id),
    previousBaselineId: nullable(row.previous_baseline_id),
    policy: policy(row),
    approvalReviewIds: row.approval_review_ids.map(stringValue),
    publishedBy: stringValue(row.published_by),
    at: Number(numericValue(row.at)),
  };
}
async function loadRevision(sql: Sql, projectId: string, id: string): Promise<WbsRevision> {
  const row = (
    await sql.query("SELECT * FROM project_wbs_revisions WHERE project_id=$1 AND id=$2", [
      projectId,
      id,
    ])
  ).rows[0];
  if (!row) throw new WbsError(404, "找不到此 Project 的 WBS Revision。");
  const action = stringValue(row.action);
  if (
    action !== "initialize" &&
    action !== "create-node" &&
    action !== "update-node" &&
    action !== "move-node" &&
    action !== "delete-subtree"
  )
    throw new WbsError(503, "Revision 操作無法讀取。");
  return {
    id: stringValue(row.id),
    version: numberValue(row.version),
    parentRevisionId: nullable(row.parent_revision_id),
    actorUserId: stringValue(row.actor_user_id),
    action,
    at: Number(numericValue(row.at)),
    document: parseWbsDocument(row.document),
  };
}
const baselineSelect =
  "SELECT b.*,p.minimum_approvals,p.allow_self_approval FROM project_wbs_baselines b JOIN project_wbs_policies p ON p.project_id=b.project_id AND p.version=b.policy_version";
async function loadBaseline(sql: Sql, projectId: string, id: string) {
  const found = (
    await sql.query(
      `${baselineSelect} WHERE b.project_id=$1 AND b.id=$2`,
      [projectId, id],
      baseline,
    )
  ).rows[0];
  if (!found) throw new WbsError(404, "找不到此 Project 的 Baseline。");
  return found;
}
async function root(sql: Sql, projectId: string) {
  const row = (
    await sql.query(
      "SELECT g.version,g.published_baseline_id,g.policy_version,p.minimum_approvals,p.allow_self_approval FROM project_wbs_governance g JOIN project_wbs_policies p ON p.project_id=g.project_id AND p.version=g.policy_version WHERE g.project_id=$1",
      [projectId],
    )
  ).rows[0];
  return row
    ? {
        exists: true,
        version: numberValue(row.version),
        baselineId: nullable(row.published_baseline_id),
        policy: policy(row),
      }
    : { exists: false, version: 0, baselineId: null, policy: defaultWbsPolicy };
}
async function reviews(
  sql: Sql,
  projectId: string,
  item: WbsProposal,
  currentPolicy: WbsPolicy,
): Promise<WbsReview[]> {
  const rows = (
    await sql.query(
      "SELECT DISTINCT ON (reviewer_user_id) * FROM project_wbs_reviews WHERE project_id=$1 AND proposal_id=$2 AND proposal_version=$3 AND candidate_revision_id=$4 AND policy_version=$5 ORDER BY reviewer_user_id,sequence DESC",
      [projectId, item.id, item.version, item.candidateRevisionId, currentPolicy.version],
    )
  ).rows;
  const result: WbsReview[] = [];
  for (const row of rows) {
    const reviewerUserId = stringValue(row.reviewer_user_id);
    let eligible = false;
    try {
      const scope = await createPostgresProjectContentScope(sql).read(reviewerUserId, projectId);
      eligible = isWbsReviewerEligible(
        item,
        currentPolicy,
        reviewerUserId,
        canReviewProjectWbs(scope.role),
      );
    } catch (error) {
      if (!(error instanceof ProjectError) || (error.status !== 403 && error.status !== 404))
        throw error;
    }
    result.push(decodeReview(row, eligible));
  }
  return result;
}
export class PostgresProjectWbsGovernanceStore implements ProjectWbsGovernanceStore {
  constructor(private readonly db: Database = businessDatabase()) {}
  view(
    userId: string,
    selector: { projectId: string },
    query: ProjectWbsGovernanceQuery,
  ): Promise<ProjectWbsGovernanceView> {
    return this.db.transaction(async (sql) => {
      const { project, role, closed } = await createPostgresProjectContentScope(sql).read(
        userId,
        selector.projectId,
      );
      const state = await root(sql, project.id);
      const draft = (
        await sql.query("SELECT head_revision_id FROM project_wbs WHERE project_id=$1", [
          project.id,
        ])
      ).rows[0];
      const proposals = (
        await sql.query(
          `${proposalSelect} AND v.version=p.version WHERE p.project_id=$1 AND ($2::integer IS NULL OR p.number<$2) ORDER BY p.number DESC LIMIT 21`,
          [project.id, query.beforeProposal ?? null],
          proposal,
        )
      ).rows;
      const baselines = (
        await sql.query(
          `${baselineSelect} WHERE b.project_id=$1 AND ($2::integer IS NULL OR b.number<$2) ORDER BY b.number DESC LIMIT 21`,
          [project.id, query.beforeBaseline ?? null],
          baseline,
        )
      ).rows;
      const publishedBaseline = state.baselineId
        ? await loadBaseline(sql, project.id, state.baselineId)
        : null;
      const selectedBaseline = query.baselineId
        ? await loadBaseline(sql, project.id, query.baselineId)
        : publishedBaseline;
      let detail: ProjectWbsGovernanceView["proposal"] = null;
      if (query.proposalId) {
        const found = await loadProposal(sql, project.id, query.proposalId, query.proposalVersion);
        if (!found) throw new WbsError(404, "找不到此 Project 的提案版本。");
        const selected = found.proposal;
        const candidate = await loadRevision(sql, project.id, selected.candidateRevisionId);
        const previous = selected.baseBaselineId
          ? await loadBaseline(sql, project.id, selected.baseBaselineId)
          : null;
        const base = previous ? await loadRevision(sql, project.id, previous.revisionId) : null;
        const published = (
          await sql.query(
            `${baselineSelect} WHERE b.project_id=$1 AND b.proposal_id=$2 AND (b.proposal_version=$3 OR $4::boolean)`,
            [project.id, selected.id, selected.version, selected.status === "PUBLISHED"],
            baseline,
          )
        ).rows[0];
        const reviewed = published
          ? await loadProposal(sql, project.id, selected.id, published.proposalVersion)
          : found;
        if (!reviewed) throw new WbsError(503, "已發布提案版本無法讀取。");
        const currentReviews = await reviews(
          sql,
          project.id,
          reviewed.proposal,
          published?.policy ?? state.policy,
        );
        const history = (
          await sql.query(
            "SELECT * FROM project_wbs_reviews WHERE project_id=$1 AND proposal_id=$2 AND ($3::integer IS NULL OR sequence<$3) ORDER BY sequence DESC LIMIT 21",
            [project.id, selected.id, query.beforeReview ?? null],
          )
        ).rows;
        const eligibleIds = new Set(
          currentReviews.filter((review) => review.eligible).map((review) => review.id),
        );
        const summary = summarizeWbsReviews(
          reviewed.proposal,
          published?.policy ?? state.policy,
          currentReviews,
        );
        detail = {
          proposal: selected,
          currentVersion: found.currentVersion,
          publication: published ?? null,
          candidate,
          base,
          differences: compareWbsDocuments(base?.document ?? null, candidate.document),
          failures: checkWbsPublication(candidate.document),
          reviews: history
            .slice(0, 20)
            .map((row) => decodeReview(row, eligibleIds.has(stringValue(row.id)))),
          nextReview: history.length > 20 ? numberValue(history[19]?.sequence) : null,
          approvals: published?.approvalReviewIds.length ?? summary.approvalReviewIds.length,
          blocked: summary.blocked,
          baseIsCurrent: selected.baseBaselineId === state.baselineId,
        };
      }
      return {
        project: { id: project.id, title: project.title },
        actorUserId: userId,
        closed,
        canPropose: !closed && canEditProjectWbs(role),
        canReview: !closed && canReviewProjectWbs(role),
        canSetPolicy: !closed && role === "ADMIN",
        version: state.version,
        policy: state.policy,
        draftRevisionId: draft ? stringValue(draft.head_revision_id) : null,
        publishedBaseline,
        proposals: proposals.slice(0, 20),
        nextProposal: proposals.length > 20 ? (proposals[19]?.number ?? null) : null,
        baselines: baselines.slice(0, 20),
        nextBaseline: baselines.length > 20 ? (baselines[19]?.number ?? null) : null,
        baseline: selectedBaseline
          ? {
              baseline: selectedBaseline,
              revision: await loadRevision(sql, project.id, selectedBaseline.revisionId),
            }
          : null,
        proposal: detail,
      };
    });
  }
  transact<T>(
    userId: string,
    command: ProjectWbsGovernanceCommand,
    operation: (transaction: ProjectWbsGovernanceTransaction) => Promise<T>,
  ): Promise<T> {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify(
          Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b))),
        ),
      )
      .digest("hex");
    return this.db.transaction(async (sql) => {
      const { project, role, closed } = await createPostgresProjectContentScope(sql).read(
        userId,
        command.projectId,
      );
      await new PostgresWbsScopeBoundary(sql).projectWritable(project.id);
      return operation({
        scope: { projectId: project.id, closed, role },
        nextId: randomUUID,
        replay: async () => {
          await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `wbs-command:${userId}:${command.requestId}`,
          ]);
          if (
            (
              await sql.query(
                "SELECT 1 FROM legacy_wbs_command_evidence WHERE actor_user_id=$1 AND request_id=$2",
                [userId, command.requestId],
              )
            ).rows.length ||
            (
              await sql.query(
                "SELECT 1 FROM project_wbs_commands WHERE actor_user_id=$1 AND request_id=$2",
                [userId, command.requestId],
              )
            ).rows.length
          )
            throw new WbsError(409, "此 requestId 已用於 WBS 內容操作。");
          const prior = (
            await sql.query(
              "SELECT project_id,fingerprint,result FROM project_wbs_governance_commands WHERE actor_user_id=$1 AND request_id=$2",
              [userId, command.requestId],
            )
          ).rows[0];
          if (!prior) return null;
          if (prior.project_id !== project.id || prior.fingerprint !== fingerprint)
            throw new WbsError(409, "此 requestId 已用於不同治理操作。");
          const value = prior.result;
          if (
            !isRecord(value) ||
            value.requestId !== command.requestId ||
            value.projectId !== project.id ||
            value.action !== command.action
          )
            throw new WbsError(503, "治理回執無法讀取。");
          return {
            requestId: command.requestId,
            projectId: project.id,
            action: command.action,
            version: numberValue(value.version),
            proposalId: nullable(value.proposalId),
            baselineId: nullable(value.baselineId),
          };
        },
        hasContent: async () =>
          Boolean(
            (await sql.query("SELECT 1 FROM project_wbs WHERE project_id=$1", [project.id])).rows
              .length,
          ),
        loadState: () => root(sql, project.id),
        loadProposal: async (id) =>
          (await loadProposal(sql, project.id, id, undefined, true))?.proposal ?? null,
        loadRevision: (id) => loadRevision(sql, project.id, id),
        loadBaseline: (id) => loadBaseline(sql, project.id, id),
        loadReviews: (item, currentPolicy) => reviews(sql, project.id, item, currentPolicy),
        save: async (change) => {
          const state = await root(sql, project.id);
          if (!state.exists) {
            await sql.query(
              "INSERT INTO project_wbs_policies(project_id,version,minimum_approvals,allow_self_approval,actor_user_id,at) VALUES($1,$2,$3,$4,$5,$6)",
              [
                project.id,
                state.policy.version,
                state.policy.minimumApprovals,
                state.policy.allowSelfApproval,
                userId,
                change.at,
              ],
            );
            await sql.query(
              "INSERT INTO project_wbs_governance(project_id,version,policy_version) VALUES($1,0,1)",
              [project.id],
            );
          }
          if (change.policy) {
            await sql.query(
              "INSERT INTO project_wbs_policies(project_id,version,minimum_approvals,allow_self_approval,actor_user_id,at) VALUES($1,$2,$3,$4,$5,$6)",
              [
                project.id,
                change.policy.version,
                change.policy.minimumApprovals,
                change.policy.allowSelfApproval,
                userId,
                change.at,
              ],
            );
            await sql.query(
              "UPDATE project_wbs_governance SET policy_version=$2 WHERE project_id=$1",
              [project.id, change.policy.version],
            );
          }
          const item = change.proposal;
          if (item) {
            if (item.version === 1)
              await sql.query(
                "INSERT INTO project_wbs_proposals(id,project_id,number,version,author_user_id,created_at) VALUES($1,$2,$3,1,$4,$5)",
                [item.id, project.id, item.number, item.authorUserId, item.createdAt],
              );
            await appendProposalVersion(sql, project.id, item, item.proposerUserId, item.updatedAt);
            if (item.version !== 1) {
              const updated = await sql.query(
                "UPDATE project_wbs_proposals SET version=$4 WHERE project_id=$1 AND id=$2 AND version=$3 RETURNING version",
                [project.id, item.id, item.version - 1, item.version],
              );
              if (!updated.rows.length) throw new WbsError(409, "提案版本衝突。");
            }
          }
          if (change.review) {
            const review = change.review.value;
            await sql.query(
              "INSERT INTO project_wbs_reviews(id,project_id,proposal_id,proposal_version,candidate_revision_id,policy_version,reviewer_user_id,decision,note,sequence,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
              [
                review.id,
                project.id,
                change.review.proposalId,
                review.proposalVersion,
                review.candidateRevisionId,
                review.policyVersion,
                review.reviewerUserId,
                review.decision,
                review.note,
                review.sequence,
                review.at,
              ],
            );
          }
          if (change.baseline) {
            const baseline = change.baseline;
            await sql.query(
              "INSERT INTO project_wbs_baselines(id,project_id,number,proposal_id,proposal_version,revision_id,previous_baseline_id,policy_version,published_by,at,approval_review_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[])",
              [
                baseline.id,
                project.id,
                baseline.number,
                baseline.proposalId,
                baseline.proposalVersion,
                baseline.revisionId,
                baseline.previousBaselineId,
                baseline.policy.version,
                baseline.publishedBy,
                baseline.at,
                baseline.approvalReviewIds,
              ],
            );
            await sql.query(
              "INSERT INTO project_wbs_outbox(id,project_id,baseline_id,revision_id,at) VALUES($1,$2,$1,$3,$4)",
              [baseline.id, project.id, baseline.revisionId, baseline.at],
            );
            await sql.query(
              "UPDATE project_wbs_governance SET published_baseline_id=$2 WHERE project_id=$1",
              [project.id, baseline.id],
            );
          }
          const changed = await sql.query(
            "UPDATE project_wbs_governance SET version=$2 WHERE project_id=$1 AND version=$3 RETURNING version",
            [project.id, change.version, command.expectedVersion],
          );
          if (!changed.rows.length) throw new WbsError(409, "治理版本衝突。");
          const result: ProjectWbsGovernanceReceipt = {
            requestId: command.requestId,
            projectId: project.id,
            action: command.action,
            version: change.version,
            proposalId: change.proposal?.id ?? change.review?.proposalId ?? null,
            baselineId: change.baseline?.id ?? null,
          };
          await sql.query(
            "INSERT INTO project_wbs_governance_commands(actor_user_id,request_id,project_id,fingerprint,result) VALUES($1,$2,$3,$4,$5::jsonb)",
            [userId, command.requestId, project.id, fingerprint, JSON.stringify(result)],
          );
          return result;
        },
      });
    });
  }
}

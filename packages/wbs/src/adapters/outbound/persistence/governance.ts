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
import type { RepositorySelector } from "@line_bot_v1/repository/contracts/selectors";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  WbsBaseline,
  WbsGovernanceCommand,
  WbsGovernanceQuery,
  WbsGovernanceReceipt,
  WbsGovernanceStore,
  WbsGovernanceView,
  WbsProposal,
  WbsReview,
} from "../../../contracts/governance.js";
import type { WbsRevision } from "../../../contracts.js";
import {
  checkWbsPublication,
  compareWbsDocuments,
  defaultWbsPolicy,
  type WbsPolicy,
} from "../../../domain/governance.js";
import { parseWbsDocument, WbsError } from "../../../domain.js";

function nullable(value: unknown) {
  return value === null ? null : stringValue(value);
}
function canPropose(permissions: readonly string[]) {
  return permissions.some((p) => ["write", "maintain", "admin"].includes(p));
}
function canReview(permissions: readonly string[]) {
  return permissions.some((p) => p === "maintain" || p === "admin");
}
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
  "SELECT p.id,p.repository_id,p.number,p.author_user_id,p.created_at,p.version AS current_version,v.version,v.actor_user_id AS proposer_user_id,v.title,v.reason,v.status,v.candidate_revision_id,v.base_baseline_id,v.at AS updated_at FROM repository_wbs_proposals p JOIN repository_wbs_proposal_versions v ON v.repository_id=p.repository_id AND v.proposal_id=p.id";
async function loadProposal(
  sql: Sql,
  repositoryId: string,
  id: string,
  version?: number,
  lock = false,
) {
  const row = (
    await sql.query(
      `${proposalSelect} AND v.version=COALESCE($3::integer,p.version) WHERE p.repository_id=$1 AND p.id=$2${lock ? " FOR UPDATE OF p" : ""}`,
      [repositoryId, id, version ?? null],
    )
  ).rows[0];
  return row ? { proposal: proposal(row), currentVersion: numberValue(row.current_version) } : null;
}
async function appendProposalVersion(
  sql: Sql,
  repositoryId: string,
  item: Pick<
    WbsProposal,
    "id" | "version" | "title" | "reason" | "status" | "candidateRevisionId" | "baseBaselineId"
  >,
  actor: string,
  now: number,
) {
  await sql.query(
    "INSERT INTO repository_wbs_proposal_versions(repository_id,proposal_id,version,title,reason,status,candidate_revision_id,base_baseline_id,actor_user_id,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      repositoryId,
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
async function advanceProposal(
  sql: Sql,
  repositoryId: string,
  item: WbsProposal,
  updates: Partial<
    Pick<WbsProposal, "title" | "reason" | "status" | "candidateRevisionId" | "baseBaselineId">
  >,
  actor: string,
  now: number,
) {
  await appendProposalVersion(
    sql,
    repositoryId,
    { ...item, ...updates, version: item.version + 1 },
    actor,
    now,
  );
  const result = await sql.query(
    "UPDATE repository_wbs_proposals SET version=version+1 WHERE repository_id=$1 AND id=$2 AND version=$3 RETURNING version",
    [repositoryId, item.id, item.version],
  );
  if (!result.rows.length) throw new WbsError(409, "提案版本衝突。");
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
async function loadRevision(sql: Sql, repositoryId: string, id: string): Promise<WbsRevision> {
  const row = (
    await sql.query("SELECT * FROM repository_wbs_revisions WHERE repository_id=$1 AND id=$2", [
      repositoryId,
      id,
    ])
  ).rows[0];
  if (!row) throw new WbsError(404, "找不到此 Repository 的 WBS Revision。");
  const action = stringValue(row.action);
  if (
    action !== "initialize" &&
    action !== "create-node" &&
    action !== "update-node" &&
    action !== "move-node" &&
    action !== "delete-subtree"
  )
    throw new WbsError(503, "Revision 操作無法讀取。");
  try {
    return {
      id: stringValue(row.id),
      version: numberValue(row.version),
      parentRevisionId: nullable(row.parent_revision_id),
      actorUserId: stringValue(row.actor_user_id),
      action,
      at: Number(numericValue(row.at)),
      document: parseWbsDocument(row.document),
    };
  } catch {
    throw new WbsError(503, "WBS 已保存內容無法讀取。");
  }
}
const baselineSelect =
  "SELECT b.*,p.minimum_approvals,p.allow_self_approval FROM repository_wbs_baselines b JOIN repository_wbs_policies p ON p.repository_id=b.repository_id AND p.version=b.policy_version";
async function loadBaseline(sql: Sql, repositoryId: string, id: string) {
  const found = (
    await sql.query(
      `${baselineSelect} WHERE b.repository_id=$1 AND b.id=$2`,
      [repositoryId, id],
      baseline,
    )
  ).rows[0];
  if (!found) throw new WbsError(404, "找不到此 Repository 的 Baseline。");
  return found;
}
async function root(sql: Sql, repositoryId: string) {
  const row = (
    await sql.query(
      "SELECT g.version,g.published_baseline_id,g.policy_version,p.minimum_approvals,p.allow_self_approval FROM repository_wbs_governance g JOIN repository_wbs_policies p ON p.repository_id=g.repository_id AND p.version=g.policy_version WHERE g.repository_id=$1",
      [repositoryId],
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
  repositoryId: string,
  item: WbsProposal,
  currentPolicy: WbsPolicy,
): Promise<WbsReview[]> {
  const rows = (
    await sql.query(
      `SELECT DISTINCT ON (reviewer_user_id) * FROM repository_wbs_reviews
    WHERE repository_id=$1 AND proposal_id=$2 AND proposal_version=$3 AND candidate_revision_id=$4 AND policy_version=$5
    ORDER BY reviewer_user_id,sequence DESC`,
      [repositoryId, item.id, item.version, item.candidateRevisionId, currentPolicy.version],
    )
  ).rows;
  const result: WbsReview[] = [];
  for (const row of rows) {
    const reviewerUserId = stringValue(row.reviewer_user_id);
    let eligible = false;
    try {
      const scope = await repositoryContentScope(sql, reviewerUserId, { repositoryId });
      eligible =
        canReview(scope.repository.permissions) &&
        (currentPolicy.allowSelfApproval ||
          (reviewerUserId !== item.authorUserId && reviewerUserId !== item.proposerUserId));
    } catch (error) {
      if (!(error instanceof RepositoryError) || (error.status !== 403 && error.status !== 404))
        throw error;
    }
    result.push(decodeReview(row, eligible));
  }
  return result;
}

export class PostgresWbsGovernanceStore implements WbsGovernanceStore {
  constructor(private readonly db: Database = businessDatabase()) {}
  view(
    userId: string,
    selector: RepositorySelector,
    query: WbsGovernanceQuery,
  ): Promise<WbsGovernanceView> {
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, selector);
      const state = await root(sql, repository.id);
      const draft = (
        await sql.query("SELECT head_revision_id FROM repository_wbs WHERE repository_id=$1", [
          repository.id,
        ])
      ).rows[0];
      const proposals = (
        await sql.query(
          `${proposalSelect} AND v.version=p.version WHERE p.repository_id=$1 AND ($2::integer IS NULL OR p.number<$2) ORDER BY p.number DESC LIMIT 21`,
          [repository.id, query.beforeProposal ?? null],
          proposal,
        )
      ).rows;
      const baselines = (
        await sql.query(
          `${baselineSelect} WHERE b.repository_id=$1 AND ($2::integer IS NULL OR b.number<$2) ORDER BY b.number DESC LIMIT 21`,
          [repository.id, query.beforeBaseline ?? null],
          baseline,
        )
      ).rows;
      const publishedBaseline = state.baselineId
        ? await loadBaseline(sql, repository.id, state.baselineId)
        : null;
      const selectedBaseline = query.baselineId
        ? await loadBaseline(sql, repository.id, query.baselineId)
        : publishedBaseline;
      let detail: WbsGovernanceView["proposal"] = null;
      if (query.proposalId) {
        const found = await loadProposal(
          sql,
          repository.id,
          query.proposalId,
          query.proposalVersion,
        );
        if (!found) throw new WbsError(404, "找不到此 Repository 的提案版本。");
        const selected = found.proposal;
        const candidate = await loadRevision(sql, repository.id, selected.candidateRevisionId);
        const previous = selected.baseBaselineId
          ? await loadBaseline(sql, repository.id, selected.baseBaselineId)
          : null;
        const base = previous ? await loadRevision(sql, repository.id, previous.revisionId) : null;
        const published =
          selected.status === "PUBLISHED"
            ? (
                await sql.query(
                  `${baselineSelect} WHERE b.repository_id=$1 AND b.proposal_id=$2`,
                  [repository.id, selected.id],
                  baseline,
                )
              ).rows[0]
            : undefined;
        const reviewed = published
          ? await loadProposal(sql, repository.id, selected.id, published.proposalVersion)
          : found;
        if (!reviewed) throw new WbsError(503, "已發布提案版本無法讀取。");
        const currentReviews = await reviews(
          sql,
          repository.id,
          reviewed.proposal,
          published?.policy ?? state.policy,
        );
        const history = (
          await sql.query(
            "SELECT * FROM repository_wbs_reviews WHERE repository_id=$1 AND proposal_id=$2 AND ($3::integer IS NULL OR sequence<$3) ORDER BY sequence DESC LIMIT 21",
            [repository.id, selected.id, query.beforeReview ?? null],
          )
        ).rows;
        const eligibleIds = new Set(
          currentReviews.filter((review) => review.eligible).map((review) => review.id),
        );
        detail = {
          proposal: selected,
          currentVersion: found.currentVersion,
          candidate,
          base,
          differences: compareWbsDocuments(base?.document ?? null, candidate.document),
          failures: checkWbsPublication(candidate.document),
          reviews: history
            .slice(0, 20)
            .map((row) => decodeReview(row, eligibleIds.has(stringValue(row.id)))),
          nextReview: history.length > 20 ? numberValue(history[19]?.sequence) : null,
          approvals:
            published?.approvalReviewIds.length ??
            currentReviews.filter((review) => review.eligible && review.decision === "APPROVE")
              .length,
          blocked: currentReviews.some(
            (review) => review.eligible && review.decision === "REQUEST_CHANGES",
          ),
          baseIsCurrent: selected.baseBaselineId === state.baselineId,
        };
      }
      return {
        repository: { id: repository.id, name: repository.name, ownerLogin: repository.ownerLogin },
        actorUserId: userId,
        archived,
        canPropose: !archived && canPropose(repository.permissions),
        canReview: !archived && canReview(repository.permissions),
        canSetPolicy: !archived && repository.permissions.includes("admin"),
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
              revision: await loadRevision(sql, repository.id, selectedBaseline.revisionId),
            }
          : null,
        proposal: detail,
      };
    });
  }
  execute(
    userId: string,
    command: WbsGovernanceCommand,
    now: number,
  ): Promise<WbsGovernanceReceipt> {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify(
          Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b))),
        ),
      )
      .digest("hex");
    return this.db.transaction(async (sql) => {
      const { repository, archived } = await repositoryContentScope(sql, userId, {
        repositoryId: command.repositoryId,
      });
      const authorized =
        command.action === "set-policy"
          ? repository.permissions.includes("admin")
          : command.action === "review-proposal" || command.action === "publish-proposal"
            ? canReview(repository.permissions)
            : canPropose(repository.permissions);
      if (!authorized) throw new WbsError(403, "目前 Repository 權限不能執行此治理操作。");
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `wbs-command:${userId}:${command.requestId}`,
      ]);
      if (
        (
          await sql.query(
            "SELECT 1 FROM repository_wbs_commands WHERE actor_user_id=$1 AND request_id=$2",
            [userId, command.requestId],
          )
        ).rows.length
      )
        throw new WbsError(409, "此 requestId 已用於 WBS 內容操作。");
      const prior = (
        await sql.query(
          "SELECT repository_id,fingerprint,result FROM repository_wbs_governance_commands WHERE actor_user_id=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0];
      if (prior) {
        if (prior.repository_id !== repository.id || prior.fingerprint !== fingerprint)
          throw new WbsError(409, "此 requestId 已用於不同治理操作。");
        const value = prior.result;
        if (
          !isRecord(value) ||
          value.requestId !== command.requestId ||
          value.repositoryId !== repository.id ||
          value.action !== command.action
        )
          throw new WbsError(503, "治理回執無法讀取。");
        return {
          requestId: command.requestId,
          repositoryId: repository.id,
          action: command.action,
          version: numberValue(value.version),
          proposalId: nullable(value.proposalId),
          baselineId: nullable(value.baselineId),
        };
      }
      if (archived) throw new WbsError(409, "Repository 已封存，不能修改治理資料。");
      const content = (
        await sql.query("SELECT 1 FROM repository_wbs WHERE repository_id=$1", [repository.id])
      ).rows[0];
      if (!content) throw new WbsError(409, "請先初始化 WBS 草稿。");
      const state = await root(sql, repository.id);
      if (state.version !== command.expectedVersion)
        throw new WbsError(409, "治理資料已更新，請重新確認。");
      if (
        "expectedPolicyVersion" in command &&
        command.expectedPolicyVersion !== state.policy.version
      )
        throw new WbsError(409, "治理政策已更新，請重新審查。");
      if (!state.exists) {
        await sql.query(
          "INSERT INTO repository_wbs_policies(repository_id,version,minimum_approvals,allow_self_approval,actor_user_id,at) VALUES($1,1,1,true,$2,$3)",
          [repository.id, userId, now],
        );
        await sql.query(
          "INSERT INTO repository_wbs_governance(repository_id,version,policy_version) VALUES($1,0,1)",
          [repository.id],
        );
      }
      const nextVersion = state.version + 1;
      let proposalId: string | null = null,
        baselineId: string | null = null;
      if (command.action === "set-policy") {
        if (
          command.minimumApprovals === state.policy.minimumApprovals &&
          command.allowSelfApproval === state.policy.allowSelfApproval
        )
          throw new WbsError(409, "政策沒有變更。");
        await sql.query(
          "INSERT INTO repository_wbs_policies(repository_id,version,minimum_approvals,allow_self_approval,actor_user_id,at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            repository.id,
            state.policy.version + 1,
            command.minimumApprovals,
            command.allowSelfApproval,
            userId,
            now,
          ],
        );
        await sql.query(
          "UPDATE repository_wbs_governance SET policy_version=$2 WHERE repository_id=$1",
          [repository.id, state.policy.version + 1],
        );
      } else {
        let item: WbsProposal | undefined;
        if (command.action !== "create-proposal") {
          item = (await loadProposal(sql, repository.id, command.proposalId, undefined, true))
            ?.proposal;
          if (!item) throw new WbsError(404, "找不到此 Repository 的提案。");
          if (item.version !== command.expectedProposalVersion || item.status !== "OPEN")
            throw new WbsError(409, "提案已更新或已結束。");
          proposalId = item.id;
        }
        if (command.action === "create-proposal" || command.action === "revise-proposal") {
          if (command.baseBaselineId !== state.baselineId)
            throw new WbsError(409, "正式基底已更新，請重新確認差異。");
          const candidate = await loadRevision(sql, repository.id, command.candidateRevisionId);
          const base = state.baselineId
            ? await loadBaseline(sql, repository.id, state.baselineId)
            : null;
          const previous = base ? await loadRevision(sql, repository.id, base.revisionId) : null;
          if (previous && !compareWbsDocuments(previous.document, candidate.document).length)
            throw new WbsError(409, "候選版本與正式範圍沒有差異。");
          if (command.action === "create-proposal") {
            proposalId = randomUUID();
            await sql.query(
              "INSERT INTO repository_wbs_proposals(id,repository_id,number,version,author_user_id,created_at) VALUES($1,$2,$3,1,$4,$5)",
              [proposalId, repository.id, nextVersion, userId, now],
            );
            await appendProposalVersion(
              sql,
              repository.id,
              {
                id: proposalId,
                version: 1,
                status: "OPEN",
                title: command.title,
                reason: command.reason,
                candidateRevisionId: command.candidateRevisionId,
                baseBaselineId: command.baseBaselineId,
              },
              userId,
              now,
            );
          } else if (item) {
            if (
              item.candidateRevisionId === command.candidateRevisionId &&
              item.baseBaselineId === command.baseBaselineId &&
              item.title === command.title &&
              item.reason === command.reason
            )
              throw new WbsError(409, "提案沒有變更。");
            await advanceProposal(
              sql,
              repository.id,
              item,
              {
                title: command.title,
                reason: command.reason,
                candidateRevisionId: command.candidateRevisionId,
                baseBaselineId: command.baseBaselineId,
              },
              userId,
              now,
            );
          }
        } else if (item && command.action === "close-proposal") {
          await advanceProposal(sql, repository.id, item, { status: "CLOSED" }, userId, now);
        } else if (item && command.action === "review-proposal") {
          if (
            !state.policy.allowSelfApproval &&
            (item.authorUserId === userId || item.proposerUserId === userId)
          )
            throw new WbsError(403, "目前政策不允許自我審查。");
          await sql.query(
            "INSERT INTO repository_wbs_reviews(id,repository_id,proposal_id,proposal_version,candidate_revision_id,policy_version,reviewer_user_id,decision,note,sequence,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [
              randomUUID(),
              repository.id,
              item.id,
              item.version,
              item.candidateRevisionId,
              state.policy.version,
              userId,
              command.decision,
              command.note,
              nextVersion,
              now,
            ],
          );
        } else if (item && command.action === "publish-proposal") {
          if (item.baseBaselineId !== state.baselineId)
            throw new WbsError(409, "正式基底已更新，請更新提案並重新審查。");
          const candidate = await loadRevision(sql, repository.id, item.candidateRevisionId);
          const failures = checkWbsPublication(candidate.document);
          if (failures.length) throw new WbsError(409, failures[0]?.message ?? "必要檢查未通過。");
          const currentReviews = await reviews(sql, repository.id, item, state.policy);
          if (
            currentReviews.some(
              (review) => review.eligible && review.decision === "REQUEST_CHANGES",
            )
          )
            throw new WbsError(409, "仍有有效的要求修改審查。");
          if (
            currentReviews.filter((review) => review.eligible && review.decision === "APPROVE")
              .length < state.policy.minimumApprovals
          )
            throw new WbsError(409, "有效核准數不足，請重新確認審查者目前權限。");
          baselineId = randomUUID();
          await sql.query(
            "INSERT INTO repository_wbs_baselines(id,repository_id,number,proposal_id,proposal_version,revision_id,previous_baseline_id,policy_version,published_by,at,approval_review_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[])",
            [
              baselineId,
              repository.id,
              nextVersion,
              item.id,
              item.version,
              item.candidateRevisionId,
              state.baselineId,
              state.policy.version,
              userId,
              now,
              currentReviews
                .filter((review) => review.eligible && review.decision === "APPROVE")
                .map((review) => review.id),
            ],
          );
          await advanceProposal(sql, repository.id, item, { status: "PUBLISHED" }, userId, now);
          await sql.query(
            "UPDATE repository_wbs_governance SET published_baseline_id=$2 WHERE repository_id=$1",
            [repository.id, baselineId],
          );
        }
      }
      const changed = await sql.query(
        "UPDATE repository_wbs_governance SET version=$2 WHERE repository_id=$1 AND version=$3 RETURNING version",
        [repository.id, nextVersion, state.version],
      );
      if (!changed.rows.length) throw new WbsError(409, "治理版本衝突。");
      const result: WbsGovernanceReceipt = {
        requestId: command.requestId,
        repositoryId: repository.id,
        action: command.action,
        version: nextVersion,
        proposalId,
        baselineId,
      };
      await sql.query(
        "INSERT INTO repository_wbs_governance_commands(actor_user_id,request_id,repository_id,fingerprint,result) VALUES($1,$2,$3,$4,$5::jsonb)",
        [userId, command.requestId, repository.id, fingerprint, JSON.stringify(result)],
      );
      return result;
    });
  }
}

import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { requireOrganizationOwner } from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { numberValue } from "@line_bot_v1/platform/validation";
import type {
  OrganizationMutationEvidence,
  OrganizationReceipt,
} from "../../../contracts/organization-governance.js";
import type {
  OrganizationCreationTransaction,
  OrganizationMemberPolicyTransaction,
  OrganizationScopeTransactions,
} from "../../../contracts/output/organization-scope.js";
import {
  organizationCommandTransaction,
  organizationGovernanceTransaction,
} from "./organization-governance-transaction.js";

function versionRow(row: Record<string, unknown>) {
  return { version: numberValue(row.version) };
}

function provisionedScopeRow(row: Record<string, unknown>) {
  return { scope_version: numberValue(row.scope_version) };
}

function hasPostgresCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export class PostgresOrganizationScope implements OrganizationScopeTransactions {
  constructor(private readonly db: Database) {}

  transactCreation(
    actor: VerifiedLineActor,
    mutation: OrganizationMutationEvidence,
    operation: (transaction: OrganizationCreationTransaction) => Promise<OrganizationReceipt>,
  ) {
    return organizationCommandTransaction(this.db, actor, null, mutation, async (sql, evidence) =>
      operation({
        replay: evidence.replay,
        nextOrganizationAccountId: () => crypto.randomUUID(),
        provision: async (organization, locator) => {
          let provisioned: { scope_version: number } | undefined;
          try {
            provisioned = (
              await sql.query(
                "SELECT scope_version FROM app_private.provision_organization_scope($1,$2,$3,$4,$5)",
                [organization.id, evidence.actorUserId, locator.login, locator.name, mutation.at],
                provisionedScopeRow,
              )
            ).rows[0];
          } catch (error) {
            if (hasPostgresCode(error, "23505")) {
              throw new GovernanceAccessError(409, "conflict", "Organization login 已被使用。");
            }
            throw error;
          }
          if (!provisioned) {
            throw new GovernanceAccessError(503, "unknown-result", "Organization 建立結果不完整。");
          }
          return provisioned.scope_version;
        },
        record: evidence.record,
      }),
    );
  }

  transactMemberPolicy(
    actor: VerifiedLineActor,
    scope: Readonly<{ organizationAccountId: string }>,
    mutation: OrganizationMutationEvidence,
    operation: (transaction: OrganizationMemberPolicyTransaction) => Promise<OrganizationReceipt>,
  ) {
    return organizationGovernanceTransaction(
      this.db,
      actor,
      scope.organizationAccountId,
      mutation,
      async (sql, evidence, organization) =>
        operation({
          organization,
          authorizeOwner: () =>
            requireOrganizationOwner(sql, scope.organizationAccountId, evidence.actorUserId),
          replay: evidence.replay,
          save: async (next, expectedVersion, policy) => {
            const changed = (
              await sql.query(
                `UPDATE organizations SET
                   member_can_create_public_repositories=$2,
                   member_can_create_private_repositories=$3,
                   member_can_create_internal_repositories=$4,
                   member_can_create_project_v2=$5,
                   member_can_create_teams=$6,
                   version=$7
                 WHERE account_id=$1 AND version=$8 AND status='active'
                 RETURNING version`,
                [
                  scope.organizationAccountId,
                  policy.memberCanCreatePublicRepositories,
                  policy.memberCanCreatePrivateRepositories,
                  policy.memberCanCreateInternalRepositories,
                  policy.memberCanCreateProjectV2,
                  policy.memberCanCreateTeams,
                  next.version,
                  expectedVersion,
                ],
                versionRow,
              )
            ).rows[0];
            if (!changed) {
              throw new GovernanceAccessError(
                409,
                "conflict",
                "Organization 狀態已更新，請重新讀取。",
              );
            }
            return changed.version;
          },
          record: evidence.record,
        }),
    );
  }
}

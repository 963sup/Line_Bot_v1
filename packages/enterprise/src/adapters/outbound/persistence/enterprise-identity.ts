import { randomUUID } from "node:crypto";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { requireEnterpriseOwner } from "@line_bot_v1/identity-access/postgres";
import type { Database } from "@line_bot_v1/platform/postgres";
import { numberValue } from "@line_bot_v1/platform/validation";
import type { EnterpriseReceipt } from "../../../contracts/enterprise-governance.js";
import type {
  EnterpriseIdentityCommand,
  EnterpriseIdentityTransaction,
  EnterpriseIdentityTransactions,
  EnterpriseProvisionTransaction,
} from "../../../contracts/output/enterprise-identity.js";
import {
  enterpriseCommandTransaction,
  enterpriseGovernanceTransaction,
} from "./enterprise-governance-transaction.js";

export class PostgresEnterpriseIdentity implements EnterpriseIdentityTransactions {
  constructor(private readonly db: Database) {}

  create(
    actor: VerifiedLineActor,
    command: Extract<EnterpriseIdentityCommand, { action: "create-enterprise" }>,
    at: number,
    operation: (transaction: EnterpriseProvisionTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    return enterpriseCommandTransaction(this.db, actor, command, at, (sql, evidence) =>
      operation({
        replay: evidence.replay,
        record: evidence.record,
        nextId: randomUUID,
        provisionForActor: async (enterprise, name, slug) => {
          let row: { version: number } | undefined;
          try {
            row = (
              await sql.query(
                "SELECT scope_version FROM app_private.provision_enterprise_scope($1,$2,$3,$4,$5)",
                [enterprise.id, evidence.actorUserId, slug, name, at],
                (row) => ({ version: numberValue(row.scope_version) }),
              )
            ).rows[0];
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "23505")
              throw new GovernanceAccessError(409, "conflict", "Enterprise slug 已被使用。");
            throw error;
          }
          if (!row)
            throw new GovernanceAccessError(503, "unknown-result", "Enterprise 建立結果不完整。");
          return row.version;
        },
      }),
    );
  }

  complete(
    actor: VerifiedLineActor,
    command: Extract<EnterpriseIdentityCommand, { action: "complete-enterprise-identity" }>,
    at: number,
    operation: (transaction: EnterpriseIdentityTransaction) => Promise<EnterpriseReceipt>,
  ): Promise<EnterpriseReceipt> {
    return enterpriseGovernanceTransaction(this.db, actor, command, at, (sql, evidence, current) =>
      operation({
        current,
        status: current.status,
        replay: evidence.replay,
        record: evidence.record,
        authorizeOwner: () =>
          requireEnterpriseOwner(sql, command.enterpriseAccountId, evidence.actorUserId),
        save: async (next) => {
          let row: { version: number } | undefined;
          try {
            row = (
              await sql.query(
                `UPDATE enterprises
               SET name=$2,slug=$3,version=version+1
               WHERE account_id=$1 AND name IS NULL AND slug IS NULL
              RETURNING version`,
                [command.enterpriseAccountId, next.name, next.slug],
                (row) => ({ version: numberValue(row.version) }),
              )
            ).rows[0];
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "23505")
              throw new GovernanceAccessError(409, "conflict", "Enterprise slug 已被使用。");
            throw error;
          }
          if (!row)
            throw new GovernanceAccessError(
              409,
              "conflict",
              "Enterprise identity 已被其他操作完成，請重新載入。",
            );
          return row.version;
        },
      }),
    );
  }
}

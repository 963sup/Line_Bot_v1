import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresEnterpriseLifecycle } from "../../adapters/outbound/persistence/enterprise-lifecycle.js";
import { PostgresEnterpriseOwner } from "../../adapters/outbound/persistence/enterprise-owner.js";
import { PostgresEnterpriseGovernance } from "../../adapters/postgres.js";
import { enterpriseGovernance } from "../../application/enterprise-governance.js";
import { executeEnterpriseOwner } from "../../application/use-cases/enterprise-owner.js";
import type { EnterpriseCommand } from "../../contracts/enterprise-governance.js";
import type { EnterpriseOwnerCommand } from "../../contracts/output/enterprise-owner.js";

function isOwnerCommand(command: EnterpriseCommand): command is EnterpriseOwnerCommand {
  return (
    command.action === "grant-enterprise-owner" || command.action === "revoke-enterprise-owner"
  );
}

export function createPostgresEnterpriseGovernance(db: Database, clock = Date.now) {
  const persistence = new PostgresEnterpriseGovernance(db);
  const owner = new PostgresEnterpriseOwner(db);
  return enterpriseGovernance(
    {
      list: (actor, query) => persistence.list(actor, query),
      detail: (actor, id) => persistence.detail(actor, id),
      detailBySlug: (actor, slug) => persistence.detailBySlug(actor, slug),
      execute: (actor, command, at) =>
        isOwnerCommand(command)
          ? executeEnterpriseOwner(owner, actor, command, at)
          : persistence.execute(actor, command, at),
    },
    new PostgresEnterpriseLifecycle(db),
    clock,
  );
}

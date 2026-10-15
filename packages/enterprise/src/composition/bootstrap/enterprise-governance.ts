import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresEnterpriseAffiliation } from "../../adapters/outbound/persistence/enterprise-affiliation.js";
import { PostgresEnterpriseIdentity } from "../../adapters/outbound/persistence/enterprise-identity.js";
import { PostgresEnterpriseLifecycle } from "../../adapters/outbound/persistence/enterprise-lifecycle.js";
import { PostgresEnterpriseOwner } from "../../adapters/outbound/persistence/enterprise-owner.js";
import { PostgresEnterpriseGovernance } from "../../adapters/postgres.js";
import { enterpriseGovernance } from "../../application/enterprise-governance.js";
import { executeEnterpriseAffiliation } from "../../application/use-cases/enterprise-affiliation.js";
import { executeEnterpriseIdentity } from "../../application/use-cases/enterprise-identity.js";
import { executeEnterpriseOwner } from "../../application/use-cases/enterprise-owner.js";
import type { EnterpriseCommand } from "../../contracts/enterprise-governance.js";
import type { EnterpriseAffiliationCommand } from "../../contracts/output/enterprise-affiliation.js";
import type { EnterpriseIdentityCommand } from "../../contracts/output/enterprise-identity.js";
import type { EnterpriseOwnerCommand } from "../../contracts/output/enterprise-owner.js";

function isOwnerCommand(command: EnterpriseCommand): command is EnterpriseOwnerCommand {
  return (
    command.action === "grant-enterprise-owner" || command.action === "revoke-enterprise-owner"
  );
}

export function createPostgresEnterpriseGovernance(db: Database, clock = Date.now) {
  const persistence = new PostgresEnterpriseGovernance(db);
  const owner = new PostgresEnterpriseOwner(db);
  const affiliation = new PostgresEnterpriseAffiliation(db);
  const identity = new PostgresEnterpriseIdentity(db);
  return enterpriseGovernance(
    {
      list: (actor, query) => persistence.list(actor, query),
      detail: (actor, id) => persistence.detail(actor, id),
      detailBySlug: (actor, slug) => persistence.detailBySlug(actor, slug),
      execute: (actor, command, at) =>
        isOwnerCommand(command)
          ? executeEnterpriseOwner(owner, actor, command, at)
          : isAffiliationCommand(command)
            ? executeEnterpriseAffiliation(affiliation, actor, command, at)
            : isIdentityCommand(command)
              ? executeEnterpriseIdentity(identity, actor, command, at)
              : persistence.execute(actor, command, at),
    },
    new PostgresEnterpriseLifecycle(db),
    clock,
  );
}

function isIdentityCommand(command: EnterpriseCommand): command is EnterpriseIdentityCommand {
  return (
    command.action === "create-enterprise" || command.action === "complete-enterprise-identity"
  );
}

function isAffiliationCommand(command: EnterpriseCommand): command is EnterpriseAffiliationCommand {
  return (
    command.action === "invite-user" ||
    command.action === "accept-invitation" ||
    command.action === "decline-invitation" ||
    command.action === "cancel-invitation" ||
    command.action === "remove-direct-affiliation" ||
    command.action === "leave-enterprise"
  );
}

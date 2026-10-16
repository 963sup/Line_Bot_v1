import type { Database } from "@line_bot_v1/platform/postgres";
import { PostgresEnterpriseAffiliation } from "../../adapters/outbound/persistence/enterprise-affiliation.js";
import { PostgresEnterpriseIdentity } from "../../adapters/outbound/persistence/enterprise-identity.js";
import { PostgresEnterpriseLifecycle } from "../../adapters/outbound/persistence/enterprise-lifecycle.js";
import { PostgresEnterpriseOrganization } from "../../adapters/outbound/persistence/enterprise-organization.js";
import { PostgresEnterpriseOwner } from "../../adapters/outbound/persistence/enterprise-owner.js";
import { PostgresEnterpriseTeam } from "../../adapters/outbound/persistence/enterprise-team.js";
import {
  detailEnterprise,
  detailEnterpriseBySlug,
  listEnterprises,
} from "../../adapters/postgres-queries.js";
import type {
  EnterpriseAffiliationCommand,
  EnterpriseIdentityCommand,
  EnterpriseOrganizationCommand,
  EnterpriseOwnerCommand,
} from "../../application/commands/enterprise-governance.js";
import { enterpriseGovernance } from "../../application/enterprise-governance.js";
import { executeEnterpriseAffiliation } from "../../application/use-cases/enterprise-affiliation.js";
import { executeEnterpriseIdentity } from "../../application/use-cases/enterprise-identity.js";
import { executeEnterpriseOrganization } from "../../application/use-cases/enterprise-organization.js";
import { executeEnterpriseOwner } from "../../application/use-cases/enterprise-owner.js";
import { executeEnterpriseTeam } from "../../application/use-cases/enterprise-team.js";
import type { EnterpriseCommand } from "../../contracts/enterprise-governance.js";

function isOwnerCommand(command: EnterpriseCommand): command is EnterpriseOwnerCommand {
  return (
    command.action === "grant-enterprise-owner" || command.action === "revoke-enterprise-owner"
  );
}

export function createPostgresEnterpriseGovernance(db: Database, clock = Date.now) {
  const owner = new PostgresEnterpriseOwner(db);
  const affiliation = new PostgresEnterpriseAffiliation(db);
  const identity = new PostgresEnterpriseIdentity(db);
  const organization = new PostgresEnterpriseOrganization(db);
  const team = new PostgresEnterpriseTeam(db);
  return enterpriseGovernance(
    {
      list: (actor, query) => listEnterprises(db, actor, query),
      detail: (actor, id) => detailEnterprise(db, actor, id),
      detailBySlug: (actor, slug) => detailEnterpriseBySlug(db, actor, slug),
      execute: (actor, command, at) =>
        isOwnerCommand(command)
          ? executeEnterpriseOwner(owner, actor, command, at)
          : isAffiliationCommand(command)
            ? executeEnterpriseAffiliation(affiliation, actor, command, at)
            : isIdentityCommand(command)
              ? executeEnterpriseIdentity(identity, actor, command, at)
              : isOrganizationCommand(command)
                ? executeEnterpriseOrganization(organization, actor, command, at)
                : executeEnterpriseTeam(team, actor, command, at),
    },
    new PostgresEnterpriseLifecycle(db),
    clock,
  );
}

function isOrganizationCommand(
  command: EnterpriseCommand,
): command is EnterpriseOrganizationCommand {
  return command.action === "attach-organization" || command.action === "detach-organization";
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

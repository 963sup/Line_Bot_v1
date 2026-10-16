import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresOrganizationPersistence } from "../../adapters/outbound/persistence/organization-governance.js";
import { PostgresOrganizationLifecycle } from "../../adapters/outbound/persistence/organization-lifecycle.js";
import { PostgresOrganizationMembership } from "../../adapters/outbound/persistence/organization-membership.js";
import { PostgresOrganizationOwner } from "../../adapters/outbound/persistence/organization-owner.js";
import type { OrganizationMembershipCommand } from "../../application/commands/organization-membership.js";
import type { OrganizationOwnerCommand } from "../../application/commands/organization-owner.js";
import { organizationGovernance } from "../../application/organization-governance.js";
import { executeOrganizationMembership } from "../../application/use-cases/organization-membership.js";
import { executeOrganizationOwner } from "../../application/use-cases/organization-owner.js";
import type { OrganizationGovernancePort } from "../../contracts/input/organization-governance.js";
import type {
  OrganizationCommand,
  OrganizationReceipt,
} from "../../contracts/organization-governance.js";

function isOwnerCommand(command: OrganizationCommand): command is OrganizationOwnerCommand {
  return (
    command.action === "grant-organization-owner" || command.action === "revoke-organization-owner"
  );
}

function isMembershipCommand(
  command: OrganizationCommand,
): command is OrganizationMembershipCommand {
  return (
    command.action === "invite-member" ||
    command.action === "accept-invitation" ||
    command.action === "decline-invitation" ||
    command.action === "cancel-invitation" ||
    command.action === "remove-direct-membership" ||
    command.action === "leave-organization"
  );
}

export class PostgresOrganizationGovernance implements OrganizationGovernancePort {
  private readonly persistence: PostgresOrganizationPersistence;
  private readonly owner: PostgresOrganizationOwner;
  private readonly membership: PostgresOrganizationMembership;
  constructor(db: Database = businessDatabase()) {
    this.persistence = new PostgresOrganizationPersistence(db);
    this.owner = new PostgresOrganizationOwner(db);
    this.membership = new PostgresOrganizationMembership(db);
  }
  list(actor: VerifiedLineActor, query: GovernanceQuery) {
    return this.persistence.list(actor, query);
  }
  detail(actor: VerifiedLineActor, organizationAccountId: string) {
    return this.persistence.detail(actor, organizationAccountId);
  }
  execute(
    actor: VerifiedLineActor,
    command: OrganizationCommand,
    at: number,
  ): Promise<OrganizationReceipt> {
    return isOwnerCommand(command)
      ? executeOrganizationOwner(this.owner, actor, command, at)
      : isMembershipCommand(command)
        ? executeOrganizationMembership(this.membership, actor, command, at)
        : this.persistence.execute(actor, command, at);
  }
}

export function createPostgresOrganizationGovernance(db: Database, clock = Date.now) {
  return organizationGovernance(
    new PostgresOrganizationGovernance(db),
    new PostgresOrganizationLifecycle(db),
    clock,
  );
}

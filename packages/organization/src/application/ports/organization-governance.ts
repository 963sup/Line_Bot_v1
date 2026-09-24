import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line-work/identity-access/contracts/governance";
import type {
  OrganizationCommand,
  OrganizationDetail,
  OrganizationList,
  OrganizationReceipt,
} from "../../contracts/organization-governance.js";

export interface OrganizationGovernancePort {
  list(actor: VerifiedLineActor, query: GovernanceQuery): Promise<OrganizationList>;
  detail(actor: VerifiedLineActor, organizationAccountId: string): Promise<OrganizationDetail>;
  execute(
    actor: VerifiedLineActor,
    command: OrganizationCommand,
    now: number,
  ): Promise<OrganizationReceipt>;
}

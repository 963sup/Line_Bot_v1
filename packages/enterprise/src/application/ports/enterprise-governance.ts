import type {
  GovernanceQuery,
  VerifiedLineActor,
} from "@line_bot_v1/identity-access/contracts/governance";
import type {
  EnterpriseCommand,
  EnterpriseDetail,
  EnterpriseList,
  EnterpriseReceipt,
} from "../../contracts/enterprise-governance.js";

export interface EnterpriseGovernancePort {
  list(actor: VerifiedLineActor, query: GovernanceQuery): Promise<EnterpriseList>;
  detail(actor: VerifiedLineActor, enterpriseAccountId: string): Promise<EnterpriseDetail>;
  detailBySlug(actor: VerifiedLineActor, slug: string): Promise<EnterpriseDetail>;
  execute(
    actor: VerifiedLineActor,
    command: EnterpriseCommand,
    now: number,
  ): Promise<EnterpriseReceipt>;
}

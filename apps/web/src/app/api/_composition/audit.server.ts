import { createAuditQuery } from "@line_bot_v1/audit/application";
import { PostgresGovernanceAuditReader } from "@line_bot_v1/identity-access/postgres/audit";

export const auditQuery = createAuditQuery(new PostgresGovernanceAuditReader());

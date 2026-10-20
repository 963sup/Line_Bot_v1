import type { Sql } from "@line_bot_v1/platform/postgres";
import { literalValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  ContractLineBasis,
  ContractLineReference,
  ContractReferenceReader,
} from "../../../contracts/output/references.js";
import { ContractError, contractErrorFromUnknown } from "../../../domain/error.js";
import { readContractRevision } from "./contracts.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class PostgresContractReferenceReader implements ContractReferenceReader {
  constructor(private readonly sql: Sql) {}

  async verifyLine(
    userId: string,
    repositoryId: string,
    ref: ContractLineReference,
    policy: Readonly<{ requireActive: boolean }>,
  ): Promise<ContractLineBasis> {
    try {
      if (
        !repositoryId ||
        repositoryId.length > 128 ||
        !uuid.test(ref.contractId) ||
        !uuid.test(ref.contractRevisionId) ||
        !uuid.test(ref.lineId)
      )
        throw new ContractError(404, "Contract line reference not found.", "NOT_FOUND");
      await repositoryContentScope(this.sql, userId, { repositoryId });
      const head = (
        await this.sql.query(
          `SELECT contract.head_revision_id,revision.state
           FROM engineering_contracts contract
           JOIN engineering_contract_revisions revision
             ON revision.repository_id=contract.repository_id
            AND revision.contract_id=contract.id
            AND revision.id=contract.head_revision_id
           WHERE contract.repository_id=$1 AND contract.id=$2
           FOR SHARE OF contract`,
          [repositoryId, ref.contractId],
          (row) => ({
            revisionId: stringValue(row.head_revision_id),
            state: literalValue(row.state, ["DRAFT", "ACTIVE", "CLOSED"]),
          }),
        )
      ).rows[0];
      if (!head) throw new ContractError(404, "Contract line reference not found.", "NOT_FOUND");
      if (
        policy.requireActive &&
        (head.state !== "ACTIVE" || head.revisionId !== ref.contractRevisionId)
      )
        throw new ContractError(
          409,
          "Contract is not active at the referenced revision.",
          "SOURCE_INVALID",
        );
      if (!policy.requireActive && head.state !== "ACTIVE" && head.state !== "CLOSED")
        throw new ContractError(409, "Contract reference is not established.", "SOURCE_INVALID");
      const revision = await readContractRevision(
        this.sql,
        repositoryId,
        ref.contractId,
        ref.contractRevisionId,
      );
      if (!revision || revision.state !== "ACTIVE")
        throw new ContractError(404, "Active Contract revision not found.", "NOT_FOUND");
      const line = revision.lines.find((candidate) => candidate.lineId === ref.lineId);
      if (!line) throw new ContractError(404, "Contract line reference not found.", "NOT_FOUND");
      return {
        contractId: revision.contractId,
        contractRevisionId: revision.id,
        lineId: line.lineId,
        resource: {
          resourceId: line.resource.resourceId,
          resourceRevisionId: line.resource.resourceRevisionId,
          resourceVersion: line.resource.resourceVersion,
          name: line.resource.name,
          measure: {
            id: line.resource.measure.id,
            name: line.resource.measure.name,
            subject: line.resource.measure.subject,
            unit: line.resource.measure.unit,
          },
          sourceQuantity: line.resource.sourceQuantity,
        },
        agreedQuantity: line.agreedQuantity,
      };
    } catch (error) {
      throw contractErrorFromUnknown(error);
    }
  }
}

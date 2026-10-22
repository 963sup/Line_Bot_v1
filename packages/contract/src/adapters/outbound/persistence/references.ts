import type { Sql } from "@line_bot_v1/platform/postgres";
import { literalValue, stringValue } from "@line_bot_v1/platform/validation";
import { repositoryContentScope } from "@line_bot_v1/repository/postgres/content-scope";
import type {
  ContractLineReference,
  ContractReferenceReader,
} from "../../../contracts/output/references.js";
import { ContractError, contractErrorFromUnknown } from "../../../domain/error.js";
import type { ContractLineBasis } from "../../../domain/line-reference.js";
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
      const common = {
        contractId: revision.contractId,
        contractRevisionId: revision.id,
        lineId: line.lineId,
        agreedQuantity: line.agreedQuantity,
      };
      return {
        ...common,
        content: {
          repositoryId: line.content.repositoryId,
          planRevisionId: line.content.planRevisionId,
          planVersion: line.content.planVersion,
          node: {
            id: line.content.node.id,
            kind: line.content.node.kind,
            title: line.content.node.title,
            body: line.content.node.body,
            path: line.content.node.path.map((item) => ({
              id: item.id,
              kind: item.kind,
              title: item.title,
            })),
            plannedQuantity:
              line.content.node.plannedQuantity === null
                ? null
                : {
                    value: line.content.node.plannedQuantity.value,
                    measure: {
                      id: line.content.node.plannedQuantity.measure.id,
                      name: line.content.node.plannedQuantity.measure.name,
                      subject: line.content.node.plannedQuantity.measure.subject,
                      unit: line.content.node.plannedQuantity.measure.unit,
                    },
                  },
          },
        },
      };
    } catch (error) {
      throw contractErrorFromUnknown(error);
    }
  }
}

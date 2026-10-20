import type { ContractRevisionDto } from "../../contracts/dto/contracts.js";
import type { ContractRevision } from "../../domain/contract.js";
import { copyContractLines } from "../../domain/contract.js";

export function contractRevisionDto(revision: ContractRevision): ContractRevisionDto {
  return {
    revisionId: revision.id,
    contractId: revision.contractId,
    repositoryId: revision.repositoryId,
    version: revision.version,
    parentRevisionId: revision.parentRevisionId,
    actorUserId: revision.actorUserId,
    at: revision.at,
    action: revision.action,
    state: revision.state,
    title: revision.title,
    body: revision.body,
    lines: copyContractLines(revision.lines),
  };
}

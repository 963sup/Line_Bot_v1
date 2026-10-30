import { isRecord } from "@line_bot_v1/platform/validation";
import {
  type ProjectManagementCommand,
  parseProjectManagementCommand,
} from "@line_bot_v1/project/contracts/management";
import {
  parseCancelWbsScopeTransferCommand,
  parseRequestWbsScopeTransferCommand,
} from "@line_bot_v1/wbs/application/commands/transfer";
import type {
  CancelWbsScopeTransferCommand,
  RequestWbsScopeTransferCommand,
  WbsScopeTransfer,
} from "@line_bot_v1/wbs/contracts/dto/transfer";
import { parseWbsScopeTransfer } from "@line_bot_v1/wbs/contracts/parse-transfer-response";

export type CreateTransferProjectCommand = Extract<
  ProjectManagementCommand,
  { action: "create-project" }
>;

export type WbsTransferOperation = Readonly<{
  actorUserId: string;
  repositoryId: string;
  sourceVersion: number;
  sourceHeadRevisionId: string;
  createCommand: CreateTransferProjectCommand;
  transferCommand: RequestWbsScopeTransferCommand | null;
  accepted: WbsScopeTransfer | null;
}>;

export type WbsTransferCancellation = Readonly<{
  actorUserId: string;
  repositoryId: string;
  command: CancelWbsScopeTransferCommand;
}>;

export function parseWbsTransferOperation(
  value: unknown,
  expected: {
    actorUserId: string;
    repositoryId: string;
    sourceVersion: number;
    sourceHeadRevisionId: string;
  },
): WbsTransferOperation {
  if (!isRecord(value)) throw new Error("WBS 移轉重試資料不正確。");
  const createCommand = parseProjectManagementCommand(value.createCommand);
  if (
    createCommand.action !== "create-project" ||
    createCommand.ownerKind !== "USER" ||
    createCommand.ownerAccountId !== expected.actorUserId ||
    createCommand.public ||
    createCommand.repositoryId !== expected.repositoryId ||
    createCommand.teamId !== null ||
    createCommand.expectedVersion !== 0 ||
    value.actorUserId !== expected.actorUserId ||
    value.repositoryId !== expected.repositoryId ||
    typeof value.sourceVersion !== "number" ||
    typeof value.sourceHeadRevisionId !== "string"
  ) {
    throw new Error("WBS 移轉重試範圍不正確。");
  }
  const transferCommand =
    value.transferCommand === null
      ? null
      : parseRequestWbsScopeTransferCommand(value.transferCommand);
  if (
    transferCommand &&
    (transferCommand.repositoryId !== expected.repositoryId ||
      transferCommand.sourceVersion !== value.sourceVersion ||
      transferCommand.sourceHeadRevisionId !== value.sourceHeadRevisionId)
  ) {
    throw new Error("WBS 移轉請求與來源版本不一致。");
  }
  const accepted = value.accepted === null ? null : parseWbsScopeTransfer(value.accepted);
  if (
    accepted &&
    (!transferCommand ||
      accepted.id !== transferCommand.transferId ||
      accepted.requestId !== transferCommand.requestId ||
      accepted.actorUserId !== expected.actorUserId ||
      accepted.repositoryId !== expected.repositoryId ||
      accepted.projectId !== transferCommand.projectId ||
      accepted.sourceVersion !== value.sourceVersion ||
      accepted.sourceHeadRevisionId !== value.sourceHeadRevisionId)
  ) {
    throw new Error("WBS 移轉回執不一致。");
  }
  if (
    !accepted &&
    (value.sourceVersion !== expected.sourceVersion ||
      value.sourceHeadRevisionId !== expected.sourceHeadRevisionId)
  ) {
    throw new Error("WBS 移轉重試來源已變更。");
  }
  return {
    actorUserId: expected.actorUserId,
    repositoryId: expected.repositoryId,
    sourceVersion: value.sourceVersion,
    sourceHeadRevisionId: value.sourceHeadRevisionId,
    createCommand,
    transferCommand,
    accepted,
  };
}

export function parseWbsTransferCancellation(
  value: unknown,
  expected: { actorUserId: string; repositoryId: string },
): WbsTransferCancellation {
  if (!isRecord(value)) throw new Error("WBS 移轉撤回重試資料不正確。");
  const command = parseCancelWbsScopeTransferCommand(value.command);
  if (
    value.actorUserId !== expected.actorUserId ||
    value.repositoryId !== expected.repositoryId ||
    command.repositoryId !== expected.repositoryId
  ) {
    throw new Error("WBS 移轉撤回重試範圍不正確。");
  }
  return { actorUserId: expected.actorUserId, repositoryId: expected.repositoryId, command };
}

export function reconcileWbsTransferCancellation(
  cancellation: WbsTransferCancellation | null,
  durable: WbsScopeTransfer | null,
): WbsTransferCancellation | null {
  if (!cancellation || !durable) return cancellation;
  return durable.state === "REQUESTED" &&
    cancellation.repositoryId === durable.repositoryId &&
    cancellation.command.repositoryId === durable.repositoryId &&
    cancellation.command.transferId === durable.id
    ? cancellation
    : null;
}

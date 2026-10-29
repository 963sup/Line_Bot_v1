import { isRecord, numberValue, stringValue } from "@line_bot_v1/platform/validation";
import type { WbsScopeTransfer } from "./dto/transfer.js";

export function parseWbsScopeTransfer(value: unknown): WbsScopeTransfer {
  if (!isRecord(value)) throw new Error("WBS 移轉回應不完整。");
  const state = value.state;
  if (state !== "REQUESTED" && state !== "ACTIVE" && state !== "CANCELLED")
    throw new Error("WBS 移轉狀態不正確。");
  return {
    id: stringValue(value.id),
    repositoryId: stringValue(value.repositoryId),
    projectId: stringValue(value.projectId),
    actorUserId: stringValue(value.actorUserId),
    requestId: stringValue(value.requestId),
    state,
    sourceVersion: numberValue(value.sourceVersion),
    sourceHeadRevisionId: stringValue(value.sourceHeadRevisionId),
    revisionCount: numberValue(value.revisionCount),
    commandCount: numberValue(value.commandCount),
    sourceHash: stringValue(value.sourceHash),
    requestedAt: numberValue(value.requestedAt),
    activatedAt: value.activatedAt === null ? null : numberValue(value.activatedAt),
    releaseSha: value.releaseSha === null ? null : stringValue(value.releaseSha),
    cancelledAt: value.cancelledAt === null ? null : numberValue(value.cancelledAt),
    cancelRequestId: value.cancelRequestId === null ? null : stringValue(value.cancelRequestId),
  };
}

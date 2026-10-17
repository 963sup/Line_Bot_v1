import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  CancelWbsScopeTransferCommand,
  RequestWbsScopeTransferCommand,
} from "../../contracts/dto/transfer.js";
import { WbsError } from "../../domain/document.js";

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const id = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || value.trim() !== value)
    throw new WbsError(400, `${label} 不正確。`);
  return value;
};

export function parseRequestWbsScopeTransferCommand(
  value: unknown,
): RequestWbsScopeTransferCommand {
  if (!isRecord(value)) throw new WbsError(400, "WBS 移轉請求格式不正確。");
  const input = value;
  const allowed = [
    "transferId",
    "requestId",
    "repositoryId",
    "projectId",
    "sourceVersion",
    "sourceHeadRevisionId",
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new WbsError(400, "WBS 移轉請求包含未知欄位。");
  if (
    typeof input.transferId !== "string" ||
    !uuid.test(input.transferId) ||
    typeof input.requestId !== "string" ||
    !uuid.test(input.requestId) ||
    typeof input.sourceHeadRevisionId !== "string" ||
    !uuid.test(input.sourceHeadRevisionId) ||
    !Number.isSafeInteger(input.sourceVersion) ||
    Number(input.sourceVersion) < 1
  )
    throw new WbsError(400, "WBS 移轉識別碼或來源版本不正確。");
  return {
    transferId: input.transferId.toLowerCase(),
    requestId: input.requestId.toLowerCase(),
    repositoryId: id(input.repositoryId, "Repository ID"),
    projectId: id(input.projectId, "Project ID"),
    sourceVersion: Number(input.sourceVersion),
    sourceHeadRevisionId: input.sourceHeadRevisionId.toLowerCase(),
  };
}

export function parseCancelWbsScopeTransferCommand(value: unknown): CancelWbsScopeTransferCommand {
  if (!isRecord(value)) throw new WbsError(400, "WBS 移轉撤回請求格式不正確。");
  const allowed = ["transferId", "repositoryId", "requestId"];
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new WbsError(400, "WBS 移轉撤回請求包含未知欄位。");
  if (
    typeof value.transferId !== "string" ||
    !uuid.test(value.transferId) ||
    typeof value.requestId !== "string" ||
    !uuid.test(value.requestId)
  )
    throw new WbsError(400, "WBS 移轉撤回識別碼不正確。");
  return {
    transferId: value.transferId.toLowerCase(),
    repositoryId: id(value.repositoryId, "Repository ID"),
    requestId: value.requestId.toLowerCase(),
  };
}

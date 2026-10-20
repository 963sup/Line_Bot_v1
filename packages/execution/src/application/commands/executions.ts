import { ExecutionError } from "../../domain/error.js";
import type { ExecutionDecision } from "../../domain/execution.js";

export type ExecutionCommand = ExecutionDecision &
  Readonly<{
    repositoryId: string;
    executionId: string;
    requestId: string;
    expectedVersion: number;
  }> &
  (
    | Readonly<{
        action: "submit";
        contractId: string;
        contractRevisionId: string;
        lineId: string;
        quantity: string;
        note: string;
      }>
    | Readonly<{ action: "accept" }>
    | Readonly<{ action: "reject" | "void"; reason: string }>
  );

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function id(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new ExecutionError(400, "Invalid Execution identifier.", "INVALID_INPUT");
  return value.toLowerCase();
}

export function parseExecutionCommand(input: unknown): ExecutionCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ExecutionError(400, "Invalid Execution command.", "INVALID_INPUT");
  const value: Record<string, unknown> = { ...input };
  if (
    typeof value.repositoryId !== "string" ||
    !value.repositoryId ||
    value.repositoryId.length > 128 ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 0 ||
    value.expectedVersion >= 2147483647
  )
    throw new ExecutionError(400, "Invalid Execution scope or version.", "INVALID_INPUT");
  const base = {
    repositoryId: value.repositoryId,
    executionId: id(value.executionId),
    requestId: id(value.requestId),
    expectedVersion: value.expectedVersion,
  };
  let command: ExecutionCommand;
  if (
    value.action === "submit" &&
    value.expectedVersion === 0 &&
    typeof value.quantity === "string" &&
    typeof value.note === "string" &&
    value.note.length <= 2000
  ) {
    command = {
      ...base,
      action: "submit",
      contractId: id(value.contractId),
      contractRevisionId: id(value.contractRevisionId),
      lineId: id(value.lineId),
      quantity: value.quantity,
      note: value.note,
    };
  } else if (value.action === "accept") command = { ...base, action: "accept" };
  else if (
    (value.action === "reject" || value.action === "void") &&
    typeof value.reason === "string" &&
    value.reason.trim().length > 0 &&
    value.reason.trim().length <= 2000
  )
    command = { ...base, action: value.action, reason: value.reason.trim() };
  else throw new ExecutionError(400, "Invalid Execution action payload.", "INVALID_INPUT");
  if (Object.keys(value).some((key) => !Object.hasOwn(command, key)))
    throw new ExecutionError(400, "Unknown Execution command field.", "INVALID_INPUT");
  return command;
}

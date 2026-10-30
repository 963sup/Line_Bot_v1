import { type FileInfo } from "@line_bot_v1/file/contracts/parse-files";
import {
  type CommercialIntakeStatus,
  parseCommercialIntakeStatusIdentity,
} from "@line_bot_v1/intelligence/contracts/output/commercial-intake";
import { record, stringValue } from "./files-projection";
export type PendingCommercialTask = {
  taskId: string;
  repositoryId: string;
  source: { fileId: string; fileRevisionId: string; sha256: string };
};
/** Historical browser pending commands retain their original target identity for exact replay. */
export type LegacyCommercialIntake = {
  commandId: string;
  repositoryId: string;
  source: PendingCommercialTask["source"];
  target: { documentId: string; draftCommandId: string; expectedDocumentVersion: number };
};
export type PendingCommercialIntake = PendingCommercialTask | LegacyCommercialIntake;

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function newCommercialIntake(file: FileInfo): PendingCommercialTask {
  return {
    taskId: crypto.randomUUID(),
    repositoryId: file.repositoryId,
    source: { fileId: file.fileId, fileRevisionId: file.revisionId, sha256: file.sha256 },
  };
}

/** Only immutable source pins and an operation identity are saved in browser storage. */
export function restoreCommercialIntake(
  raw: string | null,
  repositoryId: string,
): PendingCommercialIntake | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const pending = record(JSON.parse(raw));
    if (pending.repositoryId !== repositoryId) return null;
    const source = record(pending.source);
    const id = (value: unknown) => {
      const valueAsString = stringValue(value);
      if (!uuid.test(valueAsString)) throw new Error("Invalid pending identifier");
      return valueAsString.toLowerCase();
    };
    const sha256 = stringValue(source.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
    const pins = {
      fileId: id(source.fileId),
      fileRevisionId: id(source.fileRevisionId),
      sha256,
    };
    if ("taskId" in pending) {
      if (Object.keys(pending).sort().join(",") !== "repositoryId,source,taskId") return null;
      return { taskId: id(pending.taskId), repositoryId, source: pins };
    }
    const target = record(pending.target);
    if (target.expectedDocumentVersion !== 0) return null;
    return {
      commandId: id(pending.commandId),
      repositoryId,
      source: pins,
      target: {
        documentId: id(target.documentId),
        draftCommandId: id(target.draftCommandId),
        expectedDocumentVersion: 0,
      },
    };
  } catch {
    return null;
  }
}

export function commercialStatus(value: unknown, command: PendingCommercialIntake) {
  return parseCommercialIntakeStatusIdentity(
    value,
    "taskId" in command
      ? { taskId: command.taskId }
      : { commandId: command.commandId, documentId: command.target.documentId },
  );
}

export function commercialDocumentId(value: unknown, command: PendingCommercialIntake) {
  commercialStatus(value, command);
  return "taskId" in command ? stringValue(record(value).documentId) : command.target.documentId;
}
/** Only the owner's explicit absent-command response makes the original start safe to offer again. */
export function isMissingCommercialIntake(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    Reflect.get(error, "status") === 404 &&
    Reflect.get(error, "code") === "INTAKE_NOT_FOUND"
  );
}

/** Recovery controls express user intent; they never cancel or dispatch work themselves. */
export function commercialRecoveryActions(
  state: CommercialIntakeStatus["state"] | "",
  missingIntake: boolean,
) {
  return {
    resumeLabel:
      !missingIntake &&
      ["WAITING", "RESULT_READY", "OUTCOME_UNKNOWN", "DRAFT_SAVED"].includes(state)
        ? state === "RESULT_READY"
          ? "以已保存的解析結果重送保存"
          : "查詢並恢復原操作"
        : null,
    canAbandon:
      missingIntake || ["WAITING", "ANALYZING", "FAILED", "OUTCOME_UNKNOWN"].includes(state),
  };
}

/** Observe the current authorized saved draft without creating or resuming an analysis. */
export function observeCommercialDraft(context: {
  selected: FileInfo | null;
  pending: boolean;
  read(query: Record<string, string>): Promise<unknown>;
  onResult(revision: unknown | null): void;
  onError(error: unknown): void;
}): () => void {
  let active = true;
  const source = context.selected;
  if (!source || context.pending)
    return () => {
      active = false;
    };
  void (async () => {
    try {
      const response = record(
        await context.read({
          operation: "source",
          fileId: source.fileId,
          fileRevisionId: source.revisionId,
        }),
      );
      if (!active) return;
      const revision = response.revision;
      if (revision !== null) {
        const saved = record(revision),
          pins = record(saved.source);
        if (
          saved.repositoryId !== source.repositoryId ||
          pins.fileId !== source.fileId ||
          pins.fileRevisionId !== source.revisionId ||
          pins.sha256 !== source.sha256
        )
          throw new Error("已保存草稿與選取來源不符。");
      }
      context.onResult(revision);
    } catch (error) {
      if (active) context.onError(error);
    }
  })();
  return () => {
    active = false;
  };
}
